import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TemplateConfig {
  name: string;
  description: string;
  files: Record<string, Record<string, unknown>>;
}

export const PERSONA_TEMPLATES: Record<string, TemplateConfig> = {
  minimal: {
    name: "minimal",
    description: "Basic persona with essential fields",
    files: {
      "identity.json": {
        name: "Your Name",
        role: "Your Role",
        location: "Your Location",
      },
      "communication.json": {
        style: "direct",
        language: "en",
      },
    },
  },
  developer: {
    name: "developer",
    description: "Developer persona with technical preferences",
    files: {
      "identity.json": {
        name: "Your Name",
        role: "Software Developer",
        location: "Your Location",
      },
      "communication.json": {
        style: "technical",
        language: "en",
      },
      "taste/software.json": {
        language: "TypeScript",
        paradigm: "functional",
        dependencies: "zero",
      },
      "technical/domains.json": {
        primary: "web",
        secondary: ["ai", "devtools"],
      },
    },
  },
  creator: {
    name: "creator",
    description: "Content creator persona",
    files: {
      "identity.json": {
        name: "Your Name",
        role: "Content Creator",
        location: "Your Location",
      },
      "communication.json": {
        style: "engaging",
        language: "en",
      },
      "taste/ui.json": {
        style: "clean",
        colors: "minimal",
      },
    },
  },
  manager: {
    name: "manager",
    description: "Manager/leader persona",
    files: {
      "identity.json": {
        name: "Your Name",
        role: "Manager",
        location: "Your Location",
      },
      "communication.json": {
        style: "diplomatic",
        language: "en",
      },
      "decisions/work-style.json": {
        approach: "collaborative",
        priority: "team",
      },
    },
  },
};

export interface CreateResult {
  template: string;
  targetDir: string;
  filesCreated: number;
  timestamp: string;
}

export function createFromTemplate(
  templateName: string,
  targetDir: string,
  customData?: Record<string, unknown>
): CreateResult {
  const template = PERSONA_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Template not found: ${templateName}. Available: ${Object.keys(PERSONA_TEMPLATES).join(", ")}`);
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  let filesCreated = 0;

  for (const [fileName, data] of Object.entries(template.files)) {
    const filePath = join(targetDir, fileName);
    // `join` uses the platform separator, so scanning for "/" finds nothing on
    // Windows and yields "" — which mkdir rejects, taking every nested
    // template file with it.
    const dir = dirname(filePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(filePath)) {
      const fileData = customData ? { ...data, ...customData } : { ...data };
      writeFileSync(filePath, JSON.stringify(fileData, null, 2));
      filesCreated++;
    }
  }

  return {
    template: templateName,
    targetDir,
    filesCreated,
    timestamp: new Date().toISOString(),
  };
}

export interface TemplateInfo {
  name: string;
  description: string;
  fileCount: number;
}

export function listTemplates(): TemplateInfo[] {
  return Object.values(PERSONA_TEMPLATES).map((t) => ({
    name: t.name,
    description: t.description,
    fileCount: Object.keys(t.files).length,
  }));
}
