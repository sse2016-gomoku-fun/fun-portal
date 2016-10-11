// eslint-disable-next-line camelcase
__webpack_public_path__ = UiContext.cdn_prefix;

import 'jquery.transit';

import 'normalize.css/normalize.css';

import './misc/float.styl';
import './misc/typography.styl';
import './misc/textalign.styl';
import './misc/grid.styl';
import 'flex-layout-attribute';

import './misc/.iconfont/webicon.styl';
import './misc/structure.styl';
import './misc/section.styl';

import { PageLoader } from './misc/PageLoader';
import delay from './utils/delay';

const pageLoader = new PageLoader();

const currentPage = pageLoader.getNamedPage(document.documentElement.getAttribute('data-page'));
const includedPages = pageLoader.getAutoloadPages();

async function load() {
  const loadSequence = [
    ...includedPages.map(p => [p.beforeLoading, p]),
    [currentPage.beforeLoading, currentPage],
    ...includedPages.map(p => [p.afterLoading, p]),
    [currentPage.afterLoading, currentPage],
  ];
  for (const [func, page] of loadSequence) {
    if (typeof func !== 'function') {
      continue;
    }
    try {
      await func();
    } catch (e) {
      console.error(`Failed to load page ${page.name}\n${e.stack}`);
    }
  }
}

load();
