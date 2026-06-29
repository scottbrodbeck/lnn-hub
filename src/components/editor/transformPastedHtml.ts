export const transformPastedHtml = (
  html: string,
  onImagesRemoved?: (count: number) => void,
) => {
  const div = document.createElement('div');
  div.innerHTML = html;

  const hasStyle = (el: Element, property: string, value: string | RegExp) => {
    const style = (el as HTMLElement).style[property as keyof CSSStyleDeclaration] as string | undefined;
    if (!style) return false;
    return typeof value === 'string' ? style === value : value.test(style);
  };

  const wrapInTag = (el: Element, tagName: string) => {
    const wrapper = document.createElement(tagName);

    if (el.tagName.toLowerCase() === 'span') {
      wrapper.innerHTML = el.innerHTML;
    } else {
      wrapper.appendChild(el.cloneNode(true));
    }

    return wrapper;
  };

  const unwrapElement = (el: Element) => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent?.insertBefore(el.firstChild, el);
    }
    parent?.removeChild(el);
  };

  const convertElement = (el: Element): Element => {
    let result: Element = el;

    const fontWeight = (el as HTMLElement).style.fontWeight;
    if (
      fontWeight &&
      (fontWeight === 'bold' || fontWeight === 'bolder' || /^([6-9]\d{2}|[1-9]\d{3,})$/.test(fontWeight))
    ) {
      result = wrapInTag(result, 'strong');
    }

    if (hasStyle(el, 'fontStyle', 'italic')) {
      result = wrapInTag(result, 'em');
    }

    if (hasStyle(el, 'textDecoration', /underline/)) {
      result = wrapInTag(result, 'u');
    }

    if (hasStyle(el, 'textDecoration', /line-through/)) {
      result = wrapInTag(result, 's');
    }

    return result;
  };

  div.querySelectorAll('br').forEach((br) => {
    const parent = br.parentElement;
    if (
      parent?.tagName.toLowerCase() === 'div' ||
      (br.previousSibling?.nodeName === 'P' && br.nextSibling?.nodeName === 'P')
    ) {
      br.remove();
    }
  });

  div.querySelectorAll('hr').forEach((hr) => hr.remove());

  let removedImageCount = 0;
  div.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (
      src &&
      (src.startsWith('file://') || src.includes('msohtmlclip') || src.includes('clip_image') || src.startsWith('blob:null'))
    ) {
      removedImageCount += 1;
      const placeholder = document.createElement('p');
      placeholder.innerHTML = '<em>[Image removed - please insert using the image button]</em>';
      img.replaceWith(placeholder);
    }
  });

  if (removedImageCount > 0) {
    onImagesRemoved?.(removedImageCount);
  }

  div.querySelectorAll('v\\:shape, v\\:imagedata, v\\:fill, o\\:lock').forEach((el) => el.remove());

  div.querySelectorAll('[style*="mso-wrap-style"]').forEach((el) => {
    if (!el.textContent?.trim()) {
      el.remove();
    }
  });

  const removeComments = (node: Node) => {
    const childNodes = Array.from(node.childNodes);
    childNodes.forEach((child) => {
      if (child.nodeType === 8) {
        child.remove();
      } else if (child.hasChildNodes()) {
        removeComments(child);
      }
    });
  };
  removeComments(div);

  div.querySelectorAll('p').forEach((p) => {
    const text = p.textContent?.trim();
    const hasOnlyNbsp = !text || text === '\u00A0' || text === '';
    const hasOnlyOTags = p.innerHTML.match(/^<o:p>(&nbsp;|\s*)<\/o:p>$/);

    if (hasOnlyNbsp || hasOnlyOTags) {
      p.remove();
    }
  });

  const listParas = Array.from(div.querySelectorAll('p[style*="mso-list"]'));
  let currentList: HTMLUListElement | null = null;

  listParas.forEach((p) => {
    const conditionalComment =
      p.querySelector('span[style*="Symbol"]') || p.querySelector('span[style*="Wingdings"]');
    if (conditionalComment?.parentElement) {
      const toRemove = [];
      let node = p.firstChild;
      while (node && node !== conditionalComment.nextSibling) {
        toRemove.push(node);
        node = node.nextSibling;
      }
      toRemove.forEach((n) => n.remove());
    }

    const prevSibling = p.previousElementSibling;
    const isNewList = !prevSibling || !prevSibling.getAttribute('style')?.includes('mso-list');

    if (isNewList) {
      currentList = document.createElement('ul');
      p.parentNode?.insertBefore(currentList, p);
    }

    const li = document.createElement('li');
    li.innerHTML = p.innerHTML;
    currentList?.appendChild(li);
    p.remove();
  });

  div.querySelectorAll('span').forEach((el) => {
    const fontWeight = (el as HTMLElement).style.fontWeight;
    if (fontWeight && (fontWeight === 'normal' || fontWeight === '400' || /^[1-5]\d{2}$/.test(fontWeight))) {
      unwrapElement(el);
    }
  });

  div.querySelectorAll('span, div').forEach((el) => {
    const converted = convertElement(el);
    if (converted !== el) {
      el.replaceWith(converted);
    }
  });

  div.querySelectorAll('span').forEach((el) => {
    if (el.attributes.length === 0 || (el.attributes.length === 1 && el.hasAttribute('style'))) {
      unwrapElement(el);
    }
  });

  div.querySelectorAll('b').forEach((el) => {
    const fontWeight = (el as HTMLElement).style.fontWeight;
    if (
      fontWeight &&
      (fontWeight === 'normal' || /^[1-5]\d{2}$/.test(fontWeight) || fontWeight === '400')
    ) {
      unwrapElement(el);
    } else if (el.id && el.id.startsWith('docs-internal-guid-')) {
      unwrapElement(el);
    }
  });

  div.querySelectorAll('b').forEach((el) => {
    const strong = document.createElement('strong');
    strong.innerHTML = el.innerHTML;
    el.replaceWith(strong);
  });

  div.querySelectorAll('i').forEach((el) => {
    const em = document.createElement('em');
    em.innerHTML = el.innerHTML;
    el.replaceWith(em);
  });

  div.querySelectorAll('strike, del').forEach((el) => {
    const s = document.createElement('s');
    s.innerHTML = el.innerHTML;
    el.replaceWith(s);
  });

  div.querySelectorAll('h1').forEach((el) => {
    const h2 = document.createElement('h2');
    h2.innerHTML = el.innerHTML;
    el.replaceWith(h2);
  });

  div.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  div.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'));

  div.querySelectorAll('a').forEach((el) => {
    const href = el.getAttribute('href');
    const target = el.getAttribute('target');
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
    if (href) el.setAttribute('href', href);
    if (target) el.setAttribute('target', target);
  });

  div.querySelectorAll('[id^="docs-"]').forEach((el) => el.removeAttribute('id'));

  return div.innerHTML;
};
