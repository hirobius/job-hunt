// HDS gap (#221): a multi-line text field whose `[Variable]` tokens are atomic chips. HDS
// `Textarea` is a plain <textarea> and HDS has no token or rich-text field, so this is a
// contenteditable `role="textbox"` styled with HDS tokens in TokenTextarea.css. The value stays a
// plain string; every edit that could split a chip (Backspace / Delete beside one, arrows, Enter,
// paste) goes through the pure helpers in templateEditor.ts. Ask (hds#826): a `TokenField`
// / `Textarea` with inline atomic tokens and a caret API. Delete this when it lands.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import type { KeyboardEvent } from 'react';
import { insertAt, removeChipAt, snapOutOfChip, splitVariables, stepOver } from '../templateEditor';
import './TokenTextarea.css';

export interface TokenTextareaHandle {
  /** The last caret / selection inside the field as body offsets, or null if it never had one. */
  selection(): { start: number; end: number } | null;
  /** Focus the field with the caret at a body offset (once the new value has rendered). */
  setCaret(offset: number): void;
}

/** The body a node holds: text as is, a chip as its token, a typed line break as "\n". */
function serialize(node: Node): string {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) out += (c.nodeValue ?? '').replace(/\u00a0/g, ' ');
    else if (c instanceof HTMLElement) {
      if (c.dataset.token) out += c.dataset.token;
      else if (c.tagName === 'BR') out += c.dataset.filler ? '' : '\n';
      else {
        // A browser-made block (drag and drop, autocorrect) starts a new line.
        if ((c.tagName === 'DIV' || c.tagName === 'P') && out && !out.endsWith('\n')) out += '\n';
        out += serialize(c);
      }
    }
  });
  return out;
}

function chip(token: string, name: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'token-textarea__chip';
  el.setAttribute('contenteditable', 'false');
  el.dataset.token = token;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${name} variable`);
  el.textContent = name;
  return el;
}

function render(el: HTMLElement, value: string) {
  el.replaceChildren();
  for (const s of splitVariables(value))
    el.append(s.kind === 'text' ? document.createTextNode(s.text) : chip(s.token, s.name));
  // A trailing line break only shows (and takes a caret) with something after it.
  if (value.endsWith('\n')) {
    const br = document.createElement('br');
    br.dataset.filler = '1';
    el.append(br);
  }
}

/** True when the DOM is exactly what `render(value)` makes (so typed `[Role]` becomes a chip). */
function isCanonical(el: HTMLElement, value: string): boolean {
  const kids = [...el.childNodes].filter(
    (c) => !(c instanceof HTMLElement && c.tagName === 'BR' && c.dataset.filler),
  );
  const segs = splitVariables(value);
  let i = 0;
  for (const s of segs) {
    if (s.kind === 'var') {
      const k = kids[i++];
      if (!(k instanceof HTMLElement) || k.dataset.token !== s.token) return false;
    } else {
      // A text run may be split over several text nodes.
      let text = '';
      while (i < kids.length && kids[i].nodeType === Node.TEXT_NODE) text += kids[i++].nodeValue;
      if (text !== s.text) return false;
    }
  }
  return i === kids.length;
}

function offsetOf(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(el, 0);
  r.setEnd(node, offset);
  const frag = document.createElement('div');
  frag.append(r.cloneContents());
  return serialize(frag).length;
}

function readSelection(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  return {
    start: offsetOf(el, r.startContainer, r.startOffset),
    end: offsetOf(el, r.endContainer, r.endOffset),
  };
}

/** Place the caret at a body offset; assumes `el` holds `render(value)`. */
function placeCaret(el: HTMLElement, offset: number) {
  let left = offset;
  let node: Node = el;
  let at = el.childNodes.length;
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i];
    if (c.nodeType === Node.TEXT_NODE) {
      const len = c.nodeValue?.length ?? 0;
      if (left <= len) {
        node = c;
        at = left;
        break;
      }
      left -= len;
    } else if (c instanceof HTMLElement && c.dataset.token) {
      if (left === 0) {
        at = i;
        break;
      }
      left -= c.dataset.token.length;
      if (left < 0) {
        at = i + 1;
        break;
      }
    } else if (c instanceof HTMLElement && c.dataset.filler) {
      at = i;
      break;
    }
  }
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStart(node, at);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

export interface TokenTextareaProps {
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  placeholder?: string;
}

const TokenTextarea = forwardRef<TokenTextareaHandle, TokenTextareaProps>(function TokenTextarea(
  { value, onChange, placeholder, ...aria },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const last = useRef<{ start: number; end: number } | null>(null);
  const pending = useRef<number | null>(null);

  // Outside changes (an inserted chip, another template) re-render; our own edits already match.
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (serialize(node) !== value || !isCanonical(node, value)) render(node, value);
    if (pending.current != null) {
      node.focus();
      placeCaret(node, pending.current);
      last.current = { start: pending.current, end: pending.current };
      pending.current = null;
    }
  }, [value]);

  useEffect(() => {
    const track = () => {
      const node = el.current;
      const s = node && readSelection(node);
      if (s) last.current = s;
    };
    document.addEventListener('selectionchange', track);
    return () => document.removeEventListener('selectionchange', track);
  }, []);

  useImperativeHandle(ref, () => ({
    selection: () => last.current,
    setCaret: (offset) => {
      pending.current = offset;
      // The new value's render places it; place it again next frame in case the value didn't
      // change or a closing menu took focus back in between.
      requestAnimationFrame(() => {
        const node = el.current;
        if (!node) return;
        node.focus();
        placeCaret(node, offset);
        last.current = { start: offset, end: offset };
        pending.current = null;
      });
    },
  }));

  const commit = useCallback(
    (next: string, caret: number) => {
      pending.current = caret;
      if (next === value) {
        const node = el.current;
        if (node) {
          render(node, next);
          placeCaret(node, caret);
        }
        pending.current = null;
      } else onChange(next);
    },
    [onChange, value],
  );

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const node = el.current;
    // Leave the DOM alone mid-composition (IME); the input after it commits the text.
    if (!node || (e.nativeEvent as InputEvent).isComposing) return;
    const next = serialize(node);
    if (!isCanonical(node, next)) {
      const s = readSelection(node);
      render(node, next);
      if (s) placeCaret(node, snapOutOfChip(next, s.end));
    }
    if (next !== value) onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const node = el.current;
    const s = node && readSelection(node);
    if (!node || !s) return;
    const collapsed = s.start === s.end;
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = insertAt(value, s.start, s.end, '\n');
      commit(r.value, r.caret);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && collapsed) {
      const r = removeChipAt(value, s.start, e.key === 'Backspace' ? 'back' : 'forward');
      if (r) {
        e.preventDefault();
        commit(r.value, r.caret);
      }
    } else if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      collapsed &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      const to = stepOver(value, s.start, e.key === 'ArrowLeft' ? 'back' : 'forward');
      if (to != null) {
        e.preventDefault();
        placeCaret(node, to);
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const node = el.current;
    const s = node && readSelection(node);
    if (!s) return;
    e.preventDefault();
    const r = insertAt(
      value,
      s.start,
      s.end,
      e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'),
    );
    commit(r.value, r.caret);
  };

  return (
    <div
      ref={el}
      className="token-textarea"
      role="textbox"
      aria-multiline="true"
      aria-label={aria['aria-label']}
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      data-empty={value ? undefined : ''}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      tabIndex={0}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDrop={(e) => e.preventDefault()}
    />
  );
});

export default TokenTextarea;
