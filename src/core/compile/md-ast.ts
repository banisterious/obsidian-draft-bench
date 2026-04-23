/**
 * Shared markdown -> AST facade for the compile renderers.
 *
 * Both the ODT renderer (`render-odt.ts`) and the PDF renderer
 * (`render-pdf.ts`) consume the same capped markdown subset and
 * benefit from a single parser. The implementation lives in
 * `odt/parser.ts` (where it landed first); this module re-exports it
 * under renderer-neutral names so downstream callers don't need to
 * reach into the `odt/` subfolder.
 */

export {
	parseMarkdownForOdt as parseMarkdown,
	parseInline,
} from './odt/parser';

export type {
	OdtBlock as MdBlock,
	OdtHeading as MdHeading,
	OdtParagraph as MdParagraph,
	OdtList as MdList,
	OdtRun as MdRun,
} from './odt/parser';
