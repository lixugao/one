(function () {
  'use strict';

  var SAMPLE = [
    '# 欢迎使用 Markdown 预览',
    '',
    '在左侧编辑内容，右侧会**实时渲染**。试试修改、删除或重新输入一段文字。',
    '',
    '## 常用语法',
    '',
    '- **加粗**、*斜体*、~~删除线~~ 和 `行内代码`',
    '- [链接](https://www.example.com) 会安全地打开新页面',
    '- 任务列表：',
    '  - [x] 实时预览',
    '  - [ ] 更多语法',
    '',
    '> 引用：简单，但足够好用。',
    '',
    '### 代码块',
    '',
    '```js',
    "const greet = (name) => `你好，${name}！`;",
    "console.log(greet('Markdown'));",
    '```',
    '',
    '### 表格',
    '',
    '| 功能 | 状态 |',
    '| --- | :---: |',
    '| 实时渲染 | ✅ |',
    '| 手机适配 | ✅ |',
    '',
    '---',
    '',
    '现在，开始输入吧。'
  ].join('\n');

  var EMPTY_STATE = [
    '<div class="empty-state">',
    '<div class="empty-state-icon" aria-hidden="true">✎</div>',
    '<p class="empty-state-title">预览区是空的</p>',
    '<p>在左侧输入 Markdown，渲染结果会实时出现在这里。</p>',
    '</div>'
  ].join('');

  var input = document.getElementById('markdown-input');
  var preview = document.getElementById('preview');
  var clearButton = document.getElementById('clear-button');
  var charCount = document.getElementById('char-count');

  function render() {
    var value = input.value;
    var count = Array.from(value).length;

    charCount.textContent = count + ' 字';
    clearButton.disabled = value.length === 0;

    if (value.trim() === '') {
      preview.innerHTML = EMPTY_STATE;
      return;
    }

    preview.innerHTML = window.renderMarkdown(value);
  }

  input.addEventListener('input', render);

  clearButton.addEventListener('click', function () {
    input.value = '';
    render();
    input.focus();
  });

  input.value = SAMPLE;
  render();
})();
