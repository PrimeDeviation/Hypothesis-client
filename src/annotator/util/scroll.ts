import scrollIntoView from 'scroll-into-view';

/**
 * Return a promise that resolves on the next animation frame.
 */
function nextAnimationFrame(): Promise<number> {
  return new Promise(resolve => {
    requestAnimationFrame(resolve);
  });
}

/**
 * Linearly interpolate between two values.
 *
 * @param fraction - Value in [0, 1]
 */
function interpolate(a: number, b: number, fraction: number): number {
  return a + fraction * (b - a);
}

/**
 * Return the offset of `element` from the top of a positioned ancestor `parent`.
 *
 * @param parent - Positioned ancestor of `element`
 */
export function offsetRelativeTo(
  element: HTMLElement,
  parent: HTMLElement,
): number {
  let offset = 0;
  while (element !== parent && parent.contains(element)) {
    offset += element.offsetTop;
    element = element.offsetParent as HTMLElement;
  }
  return offset;
}

export type DurationOptions = { maxDuration?: number };

/**
 * Scroll `element` until its `scrollTop` offset reaches a target value.
 *
 * @param element - Container element to scroll
 * @param offset - Target value for the scroll offset
 * @return A promise that resolves once the scroll animation is complete
 */
export async function scrollElement(
  element: Element,
  offset: number,
  /* istanbul ignore next - defaults are overridden in tests */
  { maxDuration = 500 }: DurationOptions = {},
): Promise<void> {
  const startOffset = element.scrollTop;
  const endOffset = offset;
  const scrollStart = Date.now();

  // Choose a scroll duration proportional to the scroll distance, but capped
  // to avoid it being too slow.
  const pixelsPerMs = 3;
  const scrollDuration = Math.min(
    Math.abs(endOffset - startOffset) / pixelsPerMs,
    maxDuration,
  );

  let scrollFraction = 0.0;
  while (scrollFraction < 1.0) {
    await nextAnimationFrame();
    scrollFraction = Math.min(1.0, (Date.now() - scrollStart) / scrollDuration);
    element.scrollTop = interpolate(startOffset, endOffset, scrollFraction);
  }
}

/**
 * Smoothly scroll an element into view.
 */
export async function scrollElementIntoView(
  element: HTMLElement,
  /* istanbul ignore next - defaults are overridden in tests */
  { maxDuration = 500 }: DurationOptions = {},
): Promise<void> {
  // Make the body's `tagName` return an upper-case string in XHTML documents
  // like it does in HTML documents. This is a workaround for
  // `scrollIntoView`'s detection of the <body> element. See
  // https://github.com/KoryNunn/scroll-into-view/issues/101.
  const body = element.closest('body');
  if (body && body.tagName !== 'BODY') {
    Object.defineProperty(body, 'tagName', {
      value: 'BODY',
      configurable: true,
    });
  }

  // Ensure that the details are open before scrolling, in case the annotation
  // is within the details tag.This guarantees that the user can promptly view
  // the content on the screen.
  const details = element.closest('details');
  if (details && !details.hasAttribute('open')) {
    details.open = true;
  }

  await new Promise(resolve =>
    scrollIntoView(element, { time: maxDuration }, resolve),
  );
}
