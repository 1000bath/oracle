import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PersonaFile } from "./types.js";

/**
 * Auto-update persona data from GitHub profile and repos.
 * Zero dependencies.
 */
export class PersonaUpdater {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(homedir(), ".oracleai");
  }

  /** Sync persona data from GitHub */
  async syncFromGitHub(username: string = "1000bath"): Promise<SyncResult> {
    const result: SyncResult = {
      profile: false,
      repos: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    };

    try {
      // Fetch user profile
      const profileResponse = await fetch(`https://api.github.com/users/${username}`);
      if (profileResponse.ok) {
        const profile = await profileResponse.json() as Record<string, unknown>;
        const profileData = {
          name: profile.name,
          bio: profile.bio,
          company: profile.company,
          location: profile.location,
          blog: profile.blog,
          email: profile.email,
          updated_at: profile.updated_at,
        };
        this.saveFile("github-profile.json", profileData);
        result.profile = true;
      }

      // Fetch repos
      const reposResponse = await fetch(`https://api.github.com/users/${username}/repos?per_page=100`);
      if (reposResponse.ok) {
        const repos = await reposResponse.json() as Array<Record<string, unknown>>;
        const reposData = repos.map((r) => ({
          name: r.name,
          description: r.description,
          language: r.language,
          topics: r.topics,
          stargazers_count: r.stargazers_count,
          updated_at: r.updated_at,
        }));
        this.saveFile("github-repos.json", { repos: reposData, count: reposData.length });
        result.repos = reposData.length;
      }
    } catch (err) {
      result.errors.push(String(err));
    }

    return result;
  }

  /** Sync persona from local files */
  async syncFromFiles(filePaths: string[]): Promise<SyncResult> {
    const result: SyncResult = {
      profile: false,
      repos: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    };

    for (const filePath of filePaths) {
      try {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          const fileName = filePath.split("/").pop() ?? "unknown.json";
          this.saveFile(`imported-${fileName}`, data);
          result.repos++;
        }
      } catch (err) {
        result.errors.push(`Failed to import ${filePath}: ${err}`);
      }
    }

    return result;
  }

  private saveFile(name: string, data: unknown): void {
    const dir = join(this.dataDir, "synced");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data, null, 2));
  }
}

export interface SyncResult {
  profile: boolean;
  repos: number;
  errors: string[];
  timestamp: string;
}
