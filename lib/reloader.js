/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Reloader;
const splitUrl = function(url) {
  let hash, index, params;
  if ((index = url.indexOf('#')) >= 0) {
    hash = url.slice(index);
    url = url.slice(0, index);
  } else {
    hash = '';
  }

  if ((index = url.indexOf('?')) >= 0) {
    params = url.slice(index);
    url = url.slice(0, index);
  } else {
    params = '';
  }

  return { url, params, hash };
};

const pathFromUrl = function(url) {
  let path;
  ({ url } = splitUrl(url));
  if (url.indexOf('file://') === 0) {
    path = url.replace(new RegExp(`^file://(localhost)?`), '');
  } else {
    //                        http  :   // hostname  :8080  /
    path = url.replace(new RegExp(`^([^:]+:)?//([^:/]+)(:\\d*)?/`), '/');
  }

  // decodeURI has special handling of stuff like semicolons, so use decodeURIComponent
  return decodeURIComponent(path);
};

const pickBestMatch = function(path, objects, pathFunc) {
  let score;
  let bestMatch = { score: 0 };
  for (let object of Array.from(objects)) {
    score = numberOfMatchingSegments(path, pathFunc(object));
    if (score > bestMatch.score) {
      bestMatch = { object, score };
    }
  }

  if (bestMatch.score > 0) { return bestMatch; } else { return null; }
};

var numberOfMatchingSegments = function(path1, path2) {
  // get rid of leading slashes and normalize to lower case
  path1 = path1.replace(/^\/+/, '').toLowerCase();
  path2 = path2.replace(/^\/+/, '').toLowerCase();

  if (path1 === path2) { return 10000; }

  const comps1 = path1.split('/').reverse();
  const comps2 = path2.split('/').reverse();
  const len = Math.min(comps1.length, comps2.length);

  let eqCount = 0;
  while ((eqCount < len) && (comps1[eqCount] === comps2[eqCount])) {
    ++eqCount;
  }

  return eqCount;
};

const pathsMatch = (path1, path2) => numberOfMatchingSegments(path1, path2) > 0;


const IMAGE_STYLES = [
  { selector: 'background', styleNames: ['backgroundImage'] },
  { selector: 'border', styleNames: ['borderImage', 'webkitBorderImage', 'MozBorderImage'] }
];


export default class Reloader {

  constructor(window, console, Timer) {
    this.window = window;
    this.console = console;
    this.Timer = Timer;
    this.document = this.window.document;
    this.importCacheWaitPeriod = 200;
    this.plugins = [];
  }


  addPlugin(plugin) {
    return this.plugins.push(plugin);
  }


  analyze(callback) {
    return results;
  }


  reload(path, options) {
    this.options = options;  // avoid passing it through all the funcs
    if (this.options.stylesheetReloadTimeout == null) { this.options.stylesheetReloadTimeout = 15000; }
    for (let plugin of Array.from(this.plugins)) {
      if (plugin.reload && plugin.reload(path, options)) {
        return;
      }
    }
    if (options.liveCSS) {
      if (path.match(/\.css$/i)) {
        if (this.reloadStylesheet(path)) { return; }
      }
    }
    if (options.liveImg) {
      if (path.match(/\.(jpe?g|png|gif)$/i)) {
        this.reloadImages(path);
        return;
      }
    }
    return this.reloadPage();
  }


  reloadPage() {
    return this.window.document.location.reload();
  }


  reloadImages(path) {
    const expando = this.generateUniqueString();

    for (var img of Array.from(this.document.images)) {
      if (pathsMatch(path, pathFromUrl(img.src))) {
        img.src = this.generateCacheBustUrl(img.src, expando);
      }
    }

    if (this.document.querySelectorAll) {
      for (let { selector, styleNames } of Array.from(IMAGE_STYLES)) {
        for (img of Array.from(this.document.querySelectorAll(`[style*=${selector}]`))) {
          this.reloadStyleImages(img.style, styleNames, path, expando);
        }
      }
    }

    if (this.document.styleSheets) {
      return Array.from(this.document.styleSheets).map((styleSheet) =>
        this.reloadStylesheetImages(styleSheet, path, expando));
    }
  }


  reloadStylesheetImages(styleSheet, path, expando) {
    let rules;
    try {
      rules = styleSheet != null ? styleSheet.cssRules : undefined;
    } catch (e) {}
      //
    if (!rules) { return; }

    for (let rule of Array.from(rules)) {
      switch (rule.type) {
        case CSSRule.IMPORT_RULE:
          this.reloadStylesheetImages(rule.styleSheet, path, expando);
          break;
        case CSSRule.STYLE_RULE:
          for (let { styleNames } of Array.from(IMAGE_STYLES)) {
            this.reloadStyleImages(rule.style, styleNames, path, expando);
          }
          break;
        case CSSRule.MEDIA_RULE:
          this.reloadStylesheetImages(rule, path, expando);
          break;
      }
    }

  }


  reloadStyleImages(style, styleNames, path, expando) {
    for (let styleName of Array.from(styleNames)) {
      const value = style[styleName];
      if (typeof value === 'string') {
        const newValue = value.replace(new RegExp(`\\burl\\s*\\(([^)]*)\\)`), (match, src) => {
          if (pathsMatch(path, pathFromUrl(src))) {
            return `url(${this.generateCacheBustUrl(src, expando)})`;
          } else {
            return match;
          }
        });
        if (newValue !== value) {
          style[styleName] = newValue;
        }
      }
    }
  }


  reloadStylesheet(path) {
    // has to be a real array, because DOMNodeList will be modified
    let link;
    const links = ((() => {
      const result = [];
      for (link of Array.from(this.document.getElementsByTagName('link'))) {         if (link.rel.match(/^stylesheet$/i) && !link.__LiveReload_pendingRemoval) {
          result.push(link);
        }
      }
      return result;
    })());

    // find all imported stylesheets
    const imported = [];
    for (var style of Array.from(this.document.getElementsByTagName('style'))) {
      if (style.sheet) {
        this.collectImportedStylesheets(style, style.sheet, imported);
      }
    }
    for (link of Array.from(links)) {
      this.collectImportedStylesheets(link, link.sheet, imported);
    }

    // handle prefixfree
    if (this.window.StyleFix && this.document.querySelectorAll) {
      for (style of Array.from(this.document.querySelectorAll('style[data-href]'))) {
        links.push(style);
      }
    }

    this.console.log(`LiveReload found ${links.length} LINKed stylesheets, ${imported.length} @imported stylesheets`);
    const match = pickBestMatch(path, links.concat(imported), l => pathFromUrl(this.linkHref(l)));

    if (match) {
      if (match.object.rule) {
        this.console.log(`LiveReload is reloading imported stylesheet: ${match.object.href}`);
        this.reattachImportedRule(match.object);
      } else {
        this.console.log(`LiveReload is reloading stylesheet: ${this.linkHref(match.object)}`);
        this.reattachStylesheetLink(match.object);
      }
    } else {
      this.console.log(`LiveReload will reload all stylesheets because path '${path}' did not match any specific one`);
      for (link of Array.from(links)) {
        this.reattachStylesheetLink(link);
      }
    }
    return true;
  }


  collectImportedStylesheets(link, styleSheet, result) {
    // in WebKit, styleSheet.cssRules is null for inaccessible stylesheets;
    // Firefox/Opera may throw exceptions
    let rules;
    try {
      rules = styleSheet != null ? styleSheet.cssRules : undefined;
    } catch (e) {}
      //
    if (rules && rules.length) {
      for (let index = 0; index < rules.length; index++) {
        const rule = rules[index];
        switch (rule.type) {
          case CSSRule.CHARSET_RULE:
            continue; // do nothing
            break;
          case CSSRule.IMPORT_RULE:
            result.push({ link, rule, index, href: rule.href });
            this.collectImportedStylesheets(link, rule.styleSheet, result);
            break;
          default:
            break;  // import rules can only be preceded by charset rules
        }
      }
    }
  }


  waitUntilCssLoads(clone, func) {
    let callbackExecuted = false;

    const executeCallback = () => {
      if (callbackExecuted) { return; }
      callbackExecuted = true;
      return func();
    };

    // supported by Chrome 19+, Safari 5.2+, Firefox 9+, Opera 9+, IE6+
    // http://www.zachleat.com/web/load-css-dynamically/
    // http://pieisgood.org/test/script-link-events/
    clone.onload = () => {
      this.console.log("LiveReload: the new stylesheet has finished loading");
      this.knownToSupportCssOnLoad = true;
      return executeCallback();
    };

    if (!this.knownToSupportCssOnLoad) {
      // polling
      let poll;
      (poll = () => {
        if (clone.sheet) {
          this.console.log("LiveReload is polling until the new CSS finishes loading...");
          return executeCallback();
        } else {
          return this.Timer.start(50, poll);
        }
      })();
    }

    // fail safe
    return this.Timer.start(this.options.stylesheetReloadTimeout, executeCallback);
  }


  linkHref(link) {
    // prefixfree uses data-href when it turns LINK into STYLE
    return link.href || link.getAttribute('data-href');
  }


  reattachStylesheetLink(link) {
    // ignore LINKs that will be removed by LR soon
    let clone;
    if (link.__LiveReload_pendingRemoval) { return; }
    link.__LiveReload_pendingRemoval = true;

    if (link.tagName === 'STYLE') {
      // prefixfree
      clone = this.document.createElement('link');
      clone.rel      = 'stylesheet';
      clone.media    = link.media;
      clone.disabled = link.disabled;
    } else {
      clone = link.cloneNode(false);
    }

    clone.href = this.generateCacheBustUrl(this.linkHref(link));

    // insert the new LINK before the old one
    const parent = link.parentNode;
    if (parent.lastChild === link) {
        parent.appendChild(clone);
    } else {
        parent.insertBefore(clone, link.nextSibling);
      }

    return this.waitUntilCssLoads(clone, () => {
      let additionalWaitingTime;
      if (/AppleWebKit/.test(navigator.userAgent)) {
        additionalWaitingTime = 5;
      } else {
        additionalWaitingTime = 200;
      }

      return this.Timer.start(additionalWaitingTime, () => {
        if (!link.parentNode) { return; }
        link.parentNode.removeChild(link);
        clone.onreadystatechange = null;

        return (this.window.StyleFix != null ? this.window.StyleFix.link(clone) : undefined);
      });
    }); // prefixfree
  }


  reattachImportedRule({ rule, index, link }) {
    const parent  = rule.parentStyleSheet;
    const href    = this.generateCacheBustUrl(rule.href);
    const media   = rule.media.length ? [].join.call(rule.media, ', ') : '';
    const newRule = `@import url("${href}") ${media};`;

    // used to detect if reattachImportedRule has been called again on the same rule
    rule.__LiveReload_newHref = href;

    // WORKAROUND FOR WEBKIT BUG: WebKit resets all styles if we add @import'ed
    // stylesheet that hasn't been cached yet. Workaround is to pre-cache the
    // stylesheet by temporarily adding it as a LINK tag.
    const tempLink = this.document.createElement("link");
    tempLink.rel = 'stylesheet';
    tempLink.href = href;
    tempLink.__LiveReload_pendingRemoval = true;  // exclude from path matching
    if (link.parentNode) {
      link.parentNode.insertBefore(tempLink, link);
    }

    // wait for it to load
    return this.Timer.start(this.importCacheWaitPeriod, () => {
      if (tempLink.parentNode) { tempLink.parentNode.removeChild(tempLink); }

      // if another reattachImportedRule call is in progress, abandon this one
      if (rule.__LiveReload_newHref !== href) { return; }

      parent.insertRule(newRule, index);
      parent.deleteRule(index+1);

      // save the new rule, so that we can detect another reattachImportedRule call
      rule = parent.cssRules[index];
      rule.__LiveReload_newHref = href;

      // repeat again for good measure
      return this.Timer.start(this.importCacheWaitPeriod, () => {
        // if another reattachImportedRule call is in progress, abandon this one
        if (rule.__LiveReload_newHref !== href) { return; }

        parent.insertRule(newRule, index);
        return parent.deleteRule(index+1);
      });
    });
  }


  generateUniqueString() {
    return `livereload=${Date.now()}`;
  }


  generateCacheBustUrl(url, expando) {
    let hash, oldParams;
    if (expando == null) { expando = this.generateUniqueString(); }
    ({ url, hash, params: oldParams } = splitUrl(url));

    if (this.options.overrideURL) {
      if (url.indexOf(this.options.serverURL) < 0) {
        const originalUrl = url;
        url = this.options.serverURL + this.options.overrideURL + "?url=" + encodeURIComponent(url);
        this.console.log(`LiveReload is overriding source URL ${originalUrl} with ${url}`);
      }
    }

    let params = oldParams.replace(/(\?|&)livereload=(\d+)/, (match, sep) => `${sep}${expando}`);
    if (params === oldParams) {
      if (oldParams.length === 0) {
        params = `?${expando}`;
      } else {
        params = `${oldParams}&${expando}`;
      }
    }

    return url + params + hash;
  }

}