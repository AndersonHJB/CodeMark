import {EditorState} from '@codemirror/state';
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {highlightSelectionMatches, searchKeymap} from '@codemirror/search';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
  startCompletion,
} from '@codemirror/autocomplete';
import {lintKeymap} from '@codemirror/lint';
import {python} from '@codemirror/lang-python';
import {javascript} from '@codemirror/lang-javascript';
import {html} from '@codemirror/lang-html';
import {xml} from '@codemirror/lang-xml';
import {c as legacyC, cpp as legacyCpp, csharp as legacyCSharp, java as legacyJava} from '@codemirror/legacy-modes/mode/clike';
import {ruby as legacyRuby} from '@codemirror/legacy-modes/mode/ruby';
import {tags} from '@lezer/highlight';

try {
  const materialDarkerTheme = EditorView.theme({
    '&': {
      color: '#abb2bf',
      backgroundColor: '#111827',
    },
    '.cm-content': {
      caretColor: '#61afef',
      fontFamily: 'inherit',
      minHeight: '100%',
      padding: '14px 0',
    },
    '.cm-line': {
      padding: '0 16px',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#61afef',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#3399ff66',
    },
    '.cm-gutters': {
      backgroundColor: '#111827',
      color: '#7d8799',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: '#1f29374d',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#1f2937',
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
    },
    '.cm-tooltip': {
      backgroundColor: '#172033',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      color: '#e5eefc',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#1167d8',
      color: '#ffffff',
    },
  }, {dark: true});

  const materialDarkerHighlightStyle = HighlightStyle.define([
    {tag: tags.keyword, color: '#c792ea'},
    {tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: '#f07178'},
    {tag: [tags.function(tags.variableName), tags.labelName], color: '#82aaff'},
    {tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#ffcb6b'},
    {tag: [tags.definition(tags.name), tags.separator], color: '#eeffff'},
    {tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#ffcb6b'},
    {tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: '#89ddff'},
    {tag: [tags.meta, tags.comment], color: '#676e95'},
    {tag: tags.strong, fontWeight: '700'},
    {tag: tags.emphasis, fontStyle: 'italic'},
    {tag: tags.strikethrough, textDecoration: 'line-through'},
    {tag: tags.link, color: '#80cbc4', textDecoration: 'underline'},
    {tag: tags.heading, fontWeight: '700', color: '#c3e88d'},
    {tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#f78c6c'},
    {tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#c3e88d'},
    {tag: tags.invalid, color: '#ffffff'},
  ], {themeType: 'dark'});

  const baseExtensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(materialDarkerHighlightStyle, {fallback: true}),
    bracketMatching(),
    closeBrackets(),
    autocompletion({activateOnTyping: true}),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    materialDarkerTheme,
    keymap.of([
      {key: 'Ctrl-Space', run: startCompletion},
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
  ];

  function languageExtension(language) {
    const lang = (language || '').toLowerCase();
    if (lang === 'python') return python();
    if (lang === 'javascript') return javascript({jsx: true, typescript: true});
    if (lang === 'html') return html();
    if (lang === 'xml') return xml();
    if (lang === 'ruby') return StreamLanguage.define(legacyRuby);
    if (lang === 'c') return StreamLanguage.define(legacyC);
    if (lang === 'java') return StreamLanguage.define(legacyJava);
    if (lang === 'csharp') return StreamLanguage.define(legacyCSharp);
    if (lang === 'clike' || lang === 'cpp') return StreamLanguage.define(legacyCpp);
    return [];
  }

  function createEditor(parent, options = {}) {
    const listeners = {
      changes: [],
      inputRead: [],
      keydown: [],
    };
    let programmaticChange = false;
    let api;

    const updateListener = EditorView.updateListener.of(update => {
      if (!update.docChanged) return;

      const insertedLines = [];
      update.transactions.forEach(transaction => {
        transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          if (inserted.length) {
            insertedLines.push(...inserted.toString().split('\n'));
          }
        });
      });

      const change = {
        text: insertedLines,
        origin: programmaticChange ? 'setValue' : 'input',
      };
      listeners.inputRead.forEach(handler => handler(api, change));
      listeners.changes.forEach(handler => handler(api, update));
    });

    const keydownListener = EditorView.domEventHandlers({
      keydown(event) {
        listeners.keydown.forEach(handler => handler(api, event));
      },
    });

    const view = new EditorView({
      doc: options.value || '',
      extensions: [
        ...baseExtensions,
        languageExtension(options.language || options.mode),
        updateListener,
        keydownListener,
      ],
      parent,
    });

    api = {
      view,
      get state() {
        return {
          completionActive: completionStatus(view.state) === 'active',
        };
      },
      getValue() {
        return view.state.doc.toString();
      },
      setValue(value) {
        programmaticChange = true;
        view.dispatch({
          changes: {from: 0, to: view.state.doc.length, insert: value || ''},
        });
        programmaticChange = false;
      },
      lineCount() {
        return view.state.doc.lines;
      },
      getWrapperElement() {
        return view.dom;
      },
      getScrollerElement() {
        return view.scrollDOM;
      },
      refresh() {
        view.requestMeasure();
      },
      on(eventName, handler) {
        if (listeners[eventName]) {
          listeners[eventName].push(handler);
        }
      },
      startCompletion() {
        return startCompletion(view);
      },
      focus() {
        view.focus();
      },
      destroy() {
        view.destroy();
      },
    };

    return api;
  }

  window.ArticleCodeMirror6 = {createEditor};
  window.__resolveArticleCodeMirror6(window.ArticleCodeMirror6);
} catch (error) {
  console.error('CodeMirror 6 failed to initialize:', error);
  window.__rejectArticleCodeMirror6(error);
}
