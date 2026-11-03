(function (global) {
  'use strict';

  var HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  var FENCE_RE = /^ {0,3}```\s*([^`]*)$/;
  var FENCE_CLOSE_RE = /^ {0,3}```\s*$/;
  var HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
  var HR_RE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
  var QUOTE_RE = /^ {0,3}>/;
  var LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return HTML_ESCAPES[character];
    });
  }

  // Allow http(s), mailto, anchors and relative paths; reject script-like URLs.
  function safeUrl(raw) {
    var url = String(raw).trim();
    if (!url) {
      return '';
    }
    if (/^(?:https?:|mailto:)/i.test(url)) {
      return url;
    }
    if (/^(?:\/|\.{1,2}\/|#|\?)/.test(url)) {
      return url;
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      return url;
    }
    return '';
  }

  function renderInline(raw) {
    var stashed = [];
    var keep = function (html) {
      stashed.push(html);
      return '\u0000' + (stashed.length - 1) + '\u0001';
    };

    var text = escapeHtml(raw);

    text = text.replace(/!\[([^\]\n]*)\]\(\s*([^)\s]+)\s*\)/g, function (match, alt, url) {
      var href = safeUrl(url);
      if (!href) {
        return match;
      }
      return keep('<img src="' + href + '" alt="' + alt + '" loading="lazy">');
    });

    text = text.replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g, function (match, label, url) {
      var href = safeUrl(url);
      if (!href) {
        return match;
      }
      return keep(
        '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
      );
    });

    text = text.replace(/`([^`\n]+)`/g, function (match, code) {
      return keep('<code>' + code + '</code>');
    });

    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    return text.replace(/\u0000(\d+)\u0001/g, function (match, index) {
      return stashed[Number(index)];
    });
  }

  function splitTableRow(line) {
    var row = line.trim();
    if (row.charAt(0) === '|') {
      row = row.slice(1);
    }
    if (row.charAt(row.length - 1) === '|') {
      row = row.slice(0, -1);
    }
    return row.split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function tableStart(lines, index) {
    if (index + 1 >= lines.length) {
      return false;
    }
    if (lines[index].indexOf('|') === -1 || lines[index + 1].indexOf('|') === -1) {
      return false;
    }
    var delimiters = splitTableRow(lines[index + 1]);
    return (
      delimiters.length > 0 &&
      delimiters.every(function (cell) {
        return /^:?-{1,}:?$/.test(cell);
      })
    );
  }

  function renderTable(lines, start) {
    var header = splitTableRow(lines[start]);
    var alignments = splitTableRow(lines[start + 1]).map(function (cell) {
      var left = cell.charAt(0) === ':';
      var right = cell.charAt(cell.length - 1) === ':';
      if (left && right) {
        return 'center';
      }
      if (right) {
        return 'right';
      }
      if (left) {
        return 'left';
      }
      return '';
    });

    var i = start + 2;
    var rows = [];
    while (i < lines.length && lines[i].trim() !== '' && lines[i].indexOf('|') !== -1) {
      rows.push(splitTableRow(lines[i]));
      i += 1;
    }

    var styleFor = function (index) {
      return alignments[index] ? ' style="text-align:' + alignments[index] + '"' : '';
    };

    var head =
      '<thead><tr>' +
      header
        .map(function (cell, index) {
          return '<th' + styleFor(index) + '>' + renderInline(cell) + '</th>';
        })
        .join('') +
      '</tr></thead>';

    var body = '';
    if (rows.length > 0) {
      body =
        '<tbody>' +
        rows
          .map(function (row) {
            return (
              '<tr>' +
              header
                .map(function (cell, index) {
                  return '<td' + styleFor(index) + '>' + renderInline(row[index] || '') + '</td>';
                })
                .join('') +
              '</tr>'
            );
          })
          .join('') +
        '</tbody>';
    }

    return { html: '<table>' + head + body + '</table>', next: i };
  }

  function renderBlockquote(lines, start) {
    var inner = [];
    var i = start;
    while (i < lines.length && QUOTE_RE.test(lines[i])) {
      inner.push(lines[i].replace(/^ {0,3}>\s?/, ''));
      i += 1;
    }
    return { html: '<blockquote>' + renderMarkdown(inner.join('\n')) + '</blockquote>', next: i };
  }

  function renderList(lines, start) {
    var first = lines[start].match(LIST_RE);
    var baseIndent = first[1].length;
    var ordered = /^\d/.test(first[2]);
    var startNumber = ordered ? parseInt(first[2], 10) : 1;
    var items = [];
    var i = start;

    while (i < lines.length) {
      var line = lines[i];

      if (line.trim() === '') {
        var j = i + 1;
        while (j < lines.length && lines[j].trim() === '') {
          j += 1;
        }
        if (j < lines.length) {
          var nextItem = lines[j].match(LIST_RE);
          if (nextItem && nextItem[1].length >= baseIndent) {
            i = j;
            continue;
          }
        }
        break;
      }

      var match = line.match(LIST_RE);
      if (match) {
        var indent = match[1].length;
        var isOrdered = /^\d/.test(match[2]);
        if (indent === baseIndent && isOrdered === ordered) {
          items.push({ text: match[3], children: [] });
          i += 1;
          continue;
        }
        if (indent > baseIndent) {
          var nested = renderList(lines, i);
          if (items.length > 0) {
            items[items.length - 1].children.push(nested.html);
          }
          i = nested.next;
          continue;
        }
        break;
      }

      // Indented plain text continues the current list item.
      if (items.length > 0 && /^\s{2,}/.test(line)) {
        items[items.length - 1].text += '\n' + line.trim();
        i += 1;
        continue;
      }
      break;
    }

    var body = items
      .map(function (item) {
        var content = item.text;
        var checkbox = '';
        var taskClass = '';
        var task = content.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
          taskClass = ' class="task-list-item"';
          checkbox =
            '<input type="checkbox" disabled' + (/x/i.test(task[1]) ? ' checked' : '') + '> ';
          content = task[2];
        }
        var rendered = content
          .split('\n')
          .map(function (line) {
            return renderInline(line.trim());
          })
          .join('<br>');
        return '<li' + taskClass + '>' + checkbox + rendered + item.children.join('') + '</li>';
      })
      .join('');

    var tag = ordered ? 'ol' : 'ul';
    var startAttribute = ordered && startNumber !== 1 ? ' start="' + startNumber + '"' : '';
    return { html: '<' + tag + startAttribute + '>' + body + '</' + tag + '>', next: i };
  }

  function startsBlock(lines, index) {
    var line = lines[index];
    return (
      FENCE_RE.test(line) ||
      HEADING_RE.test(line) ||
      HR_RE.test(line) ||
      QUOTE_RE.test(line) ||
      LIST_RE.test(line) ||
      tableStart(lines, index)
    );
  }

  function renderMarkdown(source) {
    if (typeof source !== 'string') {
      return '';
    }

    var lines = source.replace(/\r\n?/g, '\n').split('\n');
    var output = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (line.trim() === '') {
        i += 1;
        continue;
      }

      var fence = line.match(FENCE_RE);
      if (fence) {
        var language = fence[1].trim().split(/\s+/)[0];
        var codeLines = [];
        i += 1;
        while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          i += 1;
        }
        var className = language ? ' class="language-' + escapeHtml(language) + '"' : '';
        output.push('<pre><code' + className + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }

      var heading = line.match(HEADING_RE);
      if (heading) {
        var level = heading[1].length;
        output.push('<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (HR_RE.test(line)) {
        output.push('<hr>');
        i += 1;
        continue;
      }

      if (QUOTE_RE.test(line)) {
        var quote = renderBlockquote(lines, i);
        output.push(quote.html);
        i = quote.next;
        continue;
      }

      if (LIST_RE.test(line)) {
        var list = renderList(lines, i);
        output.push(list.html);
        i = list.next;
        continue;
      }

      if (tableStart(lines, i)) {
        var table = renderTable(lines, i);
        output.push(table.html);
        i = table.next;
        continue;
      }

      var paragraph = [];
      while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i)) {
        paragraph.push(lines[i]);
        i += 1;
      }
      if (paragraph.length === 0) {
        paragraph.push(lines[i]);
        i += 1;
      }
      output.push(
        '<p>' +
          paragraph
            .map(function (paragraphLine) {
              return renderInline(paragraphLine.trim());
            })
            .join('<br>\n') +
          '</p>'
      );
    }

    return output.join('\n');
  }

  global.renderMarkdown = renderMarkdown;
})(typeof window !== 'undefined' ? window : globalThis);
