import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import fs from "fs";

export class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    const userDataPath = app.getPath("userData");
    this.dbPath = path.join(userDataPath, "database.sqlite");
    this.ensureDatabaseDirectory();
  }

  private ensureDatabaseDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public initialize(): void {
    if (this.db) {
      console.log("Database already initialized");
      return;
    }

    try {
      console.log(`Initializing database at ${this.dbPath}`);
      this.db = new Database(this.dbPath, { verbose: console.log });
      this.runMigrations();
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw error;
    }
  }

  private runMigrations(): void {
    if (!this.db) return;

    // Migrations will be added here later
  }

  public getDb(): Database.Database {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  public close(): void {
    if (this.db) {
      console.log("Closing database connection");
      this.db.close();
      this.db = null;
    }
  }
}

export const dbService = new DatabaseService();
