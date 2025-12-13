import http from "node:http";
import fs from "node:fs";
import path from "node:path";

/**
 * MIME type mapping for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

/**
 * Get MIME type for a file based on its extension
 */
const getMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
};

/**
 * StaticFileServer serves static files from a directory over HTTP
 */
export class StaticFileServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  private distPath: string;

  constructor(distPath: string) {
    this.distPath = distPath;
  }

  /**
   * Find an available port in the given range
   */
  private async findAvailablePort(
    startPort: number,
    endPort: number
  ): Promise<number> {
    for (let port = startPort; port <= endPort; port++) {
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        return port;
      }
    }
    throw new Error(`No available port found in range ${startPort}-${endPort}`);
  }

  /**
   * Check if a port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(port, () => {
        server.once("close", () => resolve(true));
        server.close();
      });
      server.on("error", () => resolve(false));
    });
  }

  /**
   * Validate and resolve file path, preventing directory traversal
   * Returns null if path is invalid
   */
  private resolveSafePath(urlPath: string): string | null {
    // Normalize the path to resolve any .. sequences
    const normalizedPath = path.normalize(urlPath);

    // Resolve to absolute path within distPath
    let filePath: string;
    if (normalizedPath === "/" || normalizedPath === "/index.html") {
      filePath = path.join(this.distPath, "index.html");
    } else {
      // Remove leading slash and resolve relative to distPath
      const relativePath = normalizedPath.startsWith("/")
        ? normalizedPath.slice(1)
        : normalizedPath;

      // Additional security: reject paths with .. or absolute paths
      if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
        return null;
      }

      filePath = path.join(this.distPath, relativePath);
    }

    // Security: prevent directory traversal by ensuring resolved path is within distPath
    const resolvedDistPath = path.resolve(this.distPath);
    const resolvedFilePath = path.resolve(filePath);

    // Ensure the resolved path is within the dist directory
    if (
      !resolvedFilePath.startsWith(resolvedDistPath + path.sep) &&
      resolvedFilePath !== resolvedDistPath
    ) {
      return null;
    }

    return filePath;
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    // Parse URL and remove query string
    const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;

    // Resolve and validate file path (prevents path traversal)
    const filePath = this.resolveSafePath(urlPath);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check if file exists
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // If file doesn't exist and it's not the root, try index.html (SPA routing)
        if (urlPath !== "/" && urlPath !== "/index.html") {
          const indexPath = path.join(this.distPath, "index.html");
          // Validate indexPath as well
          const resolvedDistPath = path.resolve(this.distPath);
          const resolvedIndexPath = path.resolve(indexPath);
          if (
            resolvedIndexPath.startsWith(resolvedDistPath + path.sep) ||
            resolvedIndexPath === resolvedDistPath
          ) {
            fs.stat(indexPath, (indexErr, indexStats) => {
              if (indexErr || !indexStats.isFile()) {
                res.writeHead(404);
                res.end("Not Found");
              } else {
                this.serveFile(indexPath, res);
              }
            });
          } else {
            res.writeHead(404);
            res.end("Not Found");
          }
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
        return;
      }

      this.serveFile(filePath, res);
    });
  }

  /**
   * Serve a file with appropriate headers
   * Note: filePath should already be validated before calling this method
   */
  private serveFile(filePath: string, res: http.ServerResponse): void {
    // Additional security check before serving
    const resolvedDistPath = path.resolve(this.distPath);
    const resolvedFilePath = path.resolve(filePath);
    if (
      !resolvedFilePath.startsWith(resolvedDistPath + path.sep) &&
      resolvedFilePath !== resolvedDistPath
    ) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const mimeType = getMimeType(filePath);
    const stream = fs.createReadStream(filePath);

    stream.on("error", (err: any) => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });

    stream.on("open", () => {
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
      });
      stream.pipe(res);
    });
  }

  /**
   * Start the HTTP server
   * Note: Using HTTP (not HTTPS) is acceptable for localhost-only server
   * @returns Promise that resolves to the server URL
   */
  async start(): Promise<string> {
    if (this.server) {
      throw new Error("Server is already running");
    }

    // Find available port in range 12000-12010
    this.port = await this.findAvailablePort(12000, 12010);

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, "localhost", () => {
        const url = `http://localhost:${this.port}`;
        resolve(url);
      });

      this.server.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log("Static file server stopped");
      });
      this.server = null;
      this.port = null;
    }
  }

  /**
   * Get the current server URL (null if not started)
   */
  getUrl(): string | null {
    if (this.port === null) {
      return null;
    }
    return `http://localhost:${this.port}`;
  }

  /**
   * Get the current server port (null if not started)
   */
  getPort(): number | null {
    return this.port;
  }
}
