export const normalizeInlineImageHtml = (html: string) => {
  if (!html || !html.includes('data-wp-url')) {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  Array.from(doc.querySelectorAll('img')).forEach((image) => {
    const figure = image.closest('figure');
    const wpUrl = image.getAttribute('data-wp-url') || figure?.getAttribute('data-wp-url');

    if (!wpUrl) {
      return;
    }

    image.setAttribute('src', wpUrl);
    image.setAttribute('data-wp-url', wpUrl);

    if (figure) {
      figure.setAttribute('data-wp-url', wpUrl);
    }
  });

  return doc.body.innerHTML;
};
