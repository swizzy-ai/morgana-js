import { describe, expect, it } from 'vitest';
import { htmlToJsx } from '../react/htmlToJsx';

describe('htmlToJsx', () => {
  it('rewrites class and for', () => {
    expect(htmlToJsx('<div class="a b"><label for="x">T</label></div>')).toBe(
      '<div className="a b"><label htmlFor="x">T</label></div>',
    );
  });
  it('self-closes void elements', () => {
    expect(htmlToJsx('<div><input type="text" value="v"><br><img src="s"></div>')).toBe(
      '<div><input type="text" value="v" /><br /><img src="s" /></div>',
    );
  });
  it('converts style strings to objects', () => {
    expect(htmlToJsx('<div style="color: red; margin-top: 4px">x</div>')).toBe(
      "<div style={{ color: 'red', marginTop: '4px' }}>x</div>",
    );
  });
  it('turns comments into JSX comments', () => {
    expect(htmlToJsx('<div><!-- hi --><span>a</span></div>')).toBe('<div>{/* hi */}<span>a</span></div>');
  });
  it('escapes braces in text, keeps entities', () => {
    expect(htmlToJsx('<p>a {b} &amp; c</p>')).toBe("<p>a {'{'}b{'}'} &amp; c</p>");
  });
  it('passes data and aria attributes through', () => {
    expect(htmlToJsx('<div data-entity="x" aria-label="y" data-checked="true">t</div>')).toBe(
      '<div data-entity="x" aria-label="y" data-checked="true">t</div>',
    );
  });
  it('keeps boolean attributes bare', () => {
    expect(htmlToJsx('<select multiple><option selected>a</option></select>')).toBe(
      '<select multiple><option selected>a</option></select>',
    );
  });
  it('rewrites onerror strings to React handlers', () => {
    expect(htmlToJsx(`<img src="a" onerror="this.onerror=null;this.src='b'" />`)).toBe(
      `<img src="a" onError={(e) => { e.currentTarget.onerror=null;e.currentTarget.src='b' }} />`,
    );
  });
});
