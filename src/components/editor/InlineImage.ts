import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { InlineImageNodeView } from './InlineImageNodeView';
import { InlineImageAttrs, extractInlineImageAttrs, normalizeInlineImageAttrs } from './inlineImageUtils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineImage: {
      setInlineImage: (attrs: InlineImageAttrs) => ReturnType;
      updateInlineImage: (attrs: Partial<InlineImageAttrs>) => ReturnType;
    };
  }
}

export const InlineImage = Node.create({
  name: 'inlineImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      caption: { default: null },
      recordId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-record-id'),
        renderHTML: (attributes: { recordId?: string | null }) =>
          attributes.recordId ? { 'data-record-id': attributes.recordId } : {},
      },
      sourceUrl: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-source-url'),
        renderHTML: (attributes: { sourceUrl?: string | null }) =>
          attributes.sourceUrl ? { 'data-source-url': attributes.sourceUrl } : {},
      },
      wpMediaId: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-wp-media-id');
          return value ? Number(value) : null;
        },
        renderHTML: (attributes: { wpMediaId?: number | null }) =>
          attributes.wpMediaId ? { 'data-wp-media-id': String(attributes.wpMediaId) } : {},
      },
      wpUrl: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-wp-url'),
        renderHTML: (attributes: { wpUrl?: string | null }) =>
          attributes.wpUrl ? { 'data-wp-url': attributes.wpUrl } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-inline-image]',
        getAttrs: (element) => extractInlineImageAttrs(element as HTMLElement) || false,
      },
      {
        tag: 'figure[data-type="inline-image"]',
        getAttrs: (element) => extractInlineImageAttrs(element as HTMLElement) || false,
      },
      {
        tag: 'figure',
        getAttrs: (element) => {
          const attrs = extractInlineImageAttrs(element as HTMLElement);
          return attrs?.src ? attrs : false;
        },
      },
      {
        tag: 'img',
        getAttrs: (element) => {
          if ((element as HTMLElement).closest('figure')) return false;
          const attrs = extractInlineImageAttrs(element as HTMLElement);
          return attrs?.src ? attrs : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = normalizeInlineImageAttrs(HTMLAttributes as InlineImageAttrs);
    const imgAttributes = {
      src: attrs.src,
      alt: attrs.alt || attrs.caption || '',
    };

    return [
      'figure',
      mergeAttributes({ 'data-inline-image': 'true', 'data-type': 'inline-image' }, HTMLAttributes),
      ['img', imgAttributes],
      ...(attrs.caption ? [['figcaption', {}, attrs.caption]] : []),
    ];
  },

  addCommands() {
    return {
      setInlineImage:
        (attrs: InlineImageAttrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: normalizeInlineImageAttrs(attrs),
          }),
      updateInlineImage:
        (attrs: Partial<InlineImageAttrs>) =>
        ({ state, commands }) => {
          if (!(state.selection instanceof NodeSelection) || state.selection.node.type.name !== this.name) {
            return false;
          }

          return commands.updateAttributes(this.name, attrs);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineImageNodeView);
  },
});
