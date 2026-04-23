import type { OdtBlock, OdtRun } from './parser';

/**
 * ODT XML builders for the compile pipeline.
 *
 * The ODT archive contains (at minimum) four files: `mimetype`,
 * `META-INF/manifest.xml`, `styles.xml`, `content.xml`. This module
 * builds the latter two plus the static `mimetype` / manifest
 * strings; `render-odt.ts` wires them into a JSZip archive and
 * writes to disk.
 *
 * V1 keeps the XML surface tight: paragraph + heading + list
 * elements with minimal style hooks. A future pass can extend with
 * page-header / -footer, TOC generation, and page-break support
 * (which needs scene metadata threaded through the pipeline; see
 * `section-breaks.ts` header).
 */

export const ODT_MIMETYPE = 'application/vnd.oasis.opendocument.text';

/**
 * Static `META-INF/manifest.xml` naming the four archive entries.
 * The manifest itself is entry 5; ODT readers tolerate its self-
 * reference since the archive root is implicit.
 */
export const ODT_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${ODT_MIMETYPE}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="META-INF/manifest.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

/**
 * Minimal `styles.xml` defining the paragraph + list styles the
 * content references. Heading and list styles map to the conventional
 * ODT names (`Heading_20_1` etc.) that LibreOffice and Word recognize
 * out of the box.
 */
export const ODT_STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
<office:styles>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.25in" fo:margin-bottom="0.08in" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Serif" fo:font-size="14pt"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="1" style:class="text"><style:text-properties fo:font-size="28pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="2" style:class="text"><style:text-properties fo:font-size="22pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="3" style:class="text"><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_4" style:display-name="Heading 4" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="4" style:class="text"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_5" style:display-name="Heading 5" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="5" style:class="text"><style:text-properties fo:font-size="12pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_6" style:display-name="Heading 6" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="6" style:class="text"><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0in" fo:margin-bottom="0.1in" fo:line-height="115%"/></style:style>
<style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="Mpm1"><style:page-layout-properties fo:page-width="8.5in" fo:page-height="11in" fo:margin-top="1in" fo:margin-bottom="1in" fo:margin-left="1in" fo:margin-right="1in"/></style:page-layout>
</office:automatic-styles>
<office:master-styles>
<style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>
</office:master-styles>
</office:document-styles>`;

/**
 * Build `content.xml` from a parsed block list. Each block maps to
 * one ODT element (heading, paragraph, list). Inline runs become
 * `<text:span>` children with the Bold / Italic style attached.
 */
export function buildContentXml(blocks: OdtBlock[]): string {
	const body = blocks.map(renderBlock).join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:automatic-styles>
<text:list-style style:name="BulletList">
<text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:space-before="0.25in" text:min-label-width="0.25in"/></text:list-level-style-bullet>
</text:list-style>
<text:list-style style:name="OrderedList">
<text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."><style:list-level-properties text:space-before="0.25in" text:min-label-width="0.25in"/></text:list-level-style-number>
</text:list-style>
</office:automatic-styles>
<office:body>
<office:text>
${body}
</office:text>
</office:body>
</office:document-content>`;
}

function renderBlock(block: OdtBlock): string {
	switch (block.kind) {
		case 'heading':
			return `<text:h text:style-name="Heading_20_${block.level}" text:outline-level="${block.level}">${renderRuns(block.runs)}</text:h>`;
		case 'paragraph':
			return `<text:p text:style-name="Text_20_body">${renderRuns(block.runs)}</text:p>`;
		case 'list': {
			const styleName = block.ordered ? 'OrderedList' : 'BulletList';
			const items = block.items
				.map(
					(itemRuns) =>
						`<text:list-item><text:p text:style-name="Text_20_body">${renderRuns(itemRuns)}</text:p></text:list-item>`
				)
				.join('');
			return `<text:list text:style-name="${styleName}">${items}</text:list>`;
		}
	}
}

function renderRuns(runs: OdtRun[]): string {
	return runs.map(renderRun).join('');
}

function renderRun(run: OdtRun): string {
	switch (run.kind) {
		case 'text':
			return escapeXml(run.text);
		case 'bold':
			return `<text:span text:style-name="Bold">${escapeXml(run.text)}</text:span>`;
		case 'italic':
			return `<text:span text:style-name="Italic">${escapeXml(run.text)}</text:span>`;
	}
}

/**
 * Escape the five XML-significant characters. Exported for tests;
 * every text run passes through this before going into the XML
 * output.
 */
export function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
