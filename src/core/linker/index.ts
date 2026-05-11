/**
 * Linker module entry point. Re-exports the public `DraftBenchLinker`
 * class; the implementation is decomposed across sibling modules per
 * Phase 4 of the architectural audit. See the Phase 4 deliverable in
 * `docs/planning/audit-phase-4-linker-refactor.md` for the rationale
 * and module-boundary decisions.
 */
export { DraftBenchLinker } from './lifecycle';
