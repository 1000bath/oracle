export { Oracle } from "./oracle.js";
export { PersonaRAG } from "./rag.js";
export { SemanticSearch } from "./semantic-search.js";
export { VectorIndex } from "./semantic-vector.js";
export { buildEmbeddings, searchEmbeddings, tokenizeText } from "./embeddings.js";
export { createFromTemplate, listTemplates } from "./templates.js";
export { exportPersona, importPersona, validatePersona } from "./export-import.js";
export { ConflictResolver, consolidatePersona } from "./conflict.js";
export { PersonaUpdater } from "./auto-update.js";
export type { EmbeddingIndex } from "./embeddings.js";
export type { OracleOptions, ConsultResult, TasteResult, DecisionResult, ExplainResult, Evidence, SearchResult, PersonaFile, IdentityContextOptions, IdentityContextResult } from "./types.js";

export { forgetPersona, auditPersona, governConflicts } from "./governance.js";
export type { ForgetOptions, ForgetChange, ForgetResult, AuditOptions, GovernanceAudit } from "./governance.js";
