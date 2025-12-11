// Compile as Objective-C++ (.mm)
#include <napi.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

using namespace Napi;

namespace {

ThreadSafeFunction tsf;
AXObserverRef gObserver = nullptr;
AXUIElementRef gAppEl = nullptr;
pid_t gPid = 0;
id gWsToken = nil;

static void sendJS(Env env, Function jsCb, void* data) {
  NSDictionary* dict = (__bridge_transfer NSDictionary*)data;
  Object o = Object::New(env);
  for (NSString* k in dict) {
    id v = dict[k];
    if ([v isKindOfClass:[NSString class]]) o.Set(std::string([k UTF8String]), String::New(env, std::string([(NSString*)v UTF8String])));
    else if ([v isKindOfClass:[NSNumber class]]) o.Set(std::string([k UTF8String]), Number::New(env, [(NSNumber*)v doubleValue]));
  }
  jsCb.Call({ o });
}

static void emit(NSDictionary* payload) {
  if (tsf) {
    NSDictionary* copy = [payload copy];
    tsf.BlockingCall((void*)CFBridgingRetain(copy), sendJS);
  }
}

static NSDictionary* snapshotTitle(AXUIElementRef winEl) {
  pid_t pid = 0;
  AXUIElementGetPid(winEl, &pid);
  NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
  NSString* name = app.localizedName;
  
  // Don't create snapshot if app name is not available
  if (!name || name.length == 0) return nil;
  
  NSString* bid = app.bundleIdentifier ?: @"unknown";

  CFTypeRef titleVal = nil;
  NSString* title = @"";
  if (AXUIElementCopyAttributeValue(winEl, kAXTitleAttribute, &titleVal) == kAXErrorSuccess && titleVal) {
    title = (__bridge_transfer NSString*)titleVal ?: @"";
  }
  return @{
    @"type": @"title",
    @"appName": name,
    @"bundleId": bid,
    @"pid": @(pid),
    @"title": title
  };
}

static void hookFocusedWindow();

static void axCallback(AXObserverRef /*obs*/, AXUIElementRef element, CFStringRef notification, void* /*refcon*/) {
  if (CFStringCompare(notification, kAXFocusedWindowChangedNotification, 0) == kCFCompareEqualTo) {
    hookFocusedWindow();
    return;
  }
  if (CFStringCompare(notification, kAXTitleChangedNotification, 0) == kCFCompareEqualTo) {
    NSDictionary* snapshot = snapshotTitle(element);
    if (snapshot) emit(snapshot);
    return;
  }
  if (CFStringCompare(notification, kAXUIElementDestroyedNotification, 0) == kCFCompareEqualTo) {
    hookFocusedWindow();
    return;
  }
}

static void addWinNotifs(AXUIElementRef winEl) {
  if (!gObserver || !winEl) return;
  AXObserverAddNotification(gObserver, winEl, kAXTitleChangedNotification, nullptr);
  AXObserverAddNotification(gObserver, winEl, kAXUIElementDestroyedNotification, nullptr);
  NSDictionary* snapshot = snapshotTitle(winEl);
  if (snapshot) emit(snapshot);
}

static void hookFocusedWindow() {
  if (!gAppEl || !gObserver) return;
  CFTypeRef focused = nil;
  if (AXUIElementCopyAttributeValue(gAppEl, kAXFocusedWindowAttribute, &focused) == kAXErrorSuccess && focused) {
    AXUIElementRef winEl = (AXUIElementRef)focused;
    addWinNotifs(winEl);
    CFRelease(winEl);
  }
}

static void hookApp(pid_t pid) {
  if (gObserver) { CFRunLoopRemoveSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(gObserver), kCFRunLoopDefaultMode); CFRelease(gObserver); gObserver = nullptr; }
  if (gAppEl) { CFRelease(gAppEl); gAppEl = nullptr; }

  gPid = pid;
  gAppEl = AXUIElementCreateApplication(pid);

  AXObserverRef obs = nullptr;
  if (AXObserverCreate(pid, axCallback, &obs) != kAXErrorSuccess || !obs) return;
  gObserver = obs;
  CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(gObserver), kCFRunLoopDefaultMode);

  AXObserverAddNotification(gObserver, gAppEl, kAXFocusedWindowChangedNotification, nullptr);
  hookFocusedWindow();
}

Value Start(const CallbackInfo& info) {
  Env env = info.Env();
  if (!info[0].IsFunction()) return Napi::Boolean::New(env, false);

  Function cb = info[0].As<Function>();
  tsf = ThreadSafeFunction::New(env, cb, "ax-callback", 0, 1);

  NSDictionary* opts = @{ (__bridge NSString*)kAXTrustedCheckOptionPrompt: @YES };
  AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)opts);

  gWsToken = [[NSWorkspace sharedWorkspace].notificationCenter addObserverForName:NSWorkspaceDidActivateApplicationNotification
                                                                           object:nil
                                                                            queue:[NSOperationQueue mainQueue]
                                                                       usingBlock:^(NSNotification* n) {
    NSRunningApplication* app = n.userInfo[NSWorkspaceApplicationKey];
    if (!app) return;
    NSString* appName = app.localizedName;
    if (appName && appName.length > 0) {
      emit( @{ @"type": @"app",
              @"appName": appName,
              @"bundleId": app.bundleIdentifier ?: @"unknown",
              @"pid": @(app.processIdentifier) });
    }
    hookApp(app.processIdentifier);
  }];

  NSRunningApplication* front = NSWorkspace.sharedWorkspace.frontmostApplication;
  if (front) {
    NSString* frontAppName = front.localizedName;
    if (frontAppName && frontAppName.length > 0) {
      emit( @{ @"type": @"app",
              @"appName": frontAppName,
              @"bundleId": front.bundleIdentifier ?: @"unknown",
              @"pid": @(front.processIdentifier) });
    }
    hookApp(front.processIdentifier);
  }

  return Napi::Boolean::New(env, true);
}

Value Stop(const CallbackInfo& info) {
  if (gWsToken) {
    [[NSWorkspace sharedWorkspace].notificationCenter removeObserver:gWsToken];
    gWsToken = nil;
  }
  if (gObserver) {
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(gObserver), kCFRunLoopDefaultMode);
    CFRelease(gObserver); gObserver = nullptr;
  }
  if (gAppEl) { CFRelease(gAppEl); gAppEl = nullptr; }
  if (tsf) { tsf.Release(); }
  return Napi::Boolean::New(info.Env(), true);
}

Object Init(Env env, Object exports) {
  exports.Set("start", Function::New(env, Start));
  exports.Set("stop",  Function::New(env, Stop));
  return exports;
}

} // namespace

NODE_API_MODULE(ax_observer, Init)
