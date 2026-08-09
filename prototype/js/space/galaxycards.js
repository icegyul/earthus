// 은하수·우주 거대 구조 교육 카드
//
// ⚠️ 우리 은하를 밖에서 찍은 사진은 존재하지 않는다. 두 이미지는 공식 상상도이며,
//    이미지 위의 "상상도 · 크레딧" 라벨을 절대 숨기지 않는다.
// ⚠️ 이미지는 원 기관 페이지에서 내려받아 로컬 캐시한다. 화면에는 원본 설명과
//    이용 조건 링크를 함께 둔다. 정적인 카드라 타이머나 애니메이션을 만들지 않는다.

import { store } from '../store.js';
import { i18n } from '../i18n.js';

const CARDS = {
  milkyway: {
    image: 'space/galaxy/milky-way-gaia-labelled.jpg',
    credit: 'ESA/Gaia/DPAC, Stefan Payne-Wardenaar',
    released: '2025-01-29',
    source: 'https://www.esa.int/ESA_Multimedia/Images/2025/01/Milky_Way_map_by_Gaia_labelled',
    facts: 'https://science.nasa.gov/universe/galaxies/',
    licence: 'https://creativecommons.org/licenses/by-sa/3.0/igo/',
    sun: { ko: '← 그림의 화살표가 태양계', en: '← The image arrow marks the Solar System' },
  },
  galaxies: {
    image: 'space/galaxy/cosmic-web-reionization.jpg',
    credit: 'NASA-GSFC, AVL-NCSA',
    released: '2018-05-21',
    source: 'https://science.nasa.gov/asset/webb/re-ionization-era/',
    licence: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  },
};

const t = key => i18n.STATIC[key]?.[i18n.lang === 'en' ? 'en' : 'ko'] || key;

export const galaxyCards = {
  root: null,
  intro: null,

  init() {
    if (this.root) return this;
    this.root = document.getElementById('galaxyCards');
    this.intro = document.getElementById('spaceSceneIntro');
    if (!this.root || !this.intro) return this;
    store.on('scene', (scene, stage) => this.render(scene, stage));
    i18n.onChange(() => this.render(store.scene, store.sceneStage));
    this.render(store.scene, store.sceneStage);
    return this;
  },

  render(scene, stage) {
    if (!this.root || !this.intro) return;
    const card = scene === 'space' ? CARDS[stage] : null;
    // solarScene도 같은 소개 영역을 제어한다. 등록 순서상 이 모듈이 마지막에
    // 확정하므로, 태양계만 숨기고 달·기본 우주 단계에서는 원래 소개를 남긴다.
    this.intro.hidden = scene === 'space' && stage === 'solar';
    this.root.hidden = !card;
    if (!card) {
      this.root.replaceChildren();
      this.paintHeading('explore.space');
      return;
    }

    this.paintHeading(`galaxy.${stage}`);
    const ko = i18n.lang !== 'en';
    const article = document.createElement('article');
    article.className = 'galaxy-card';

    const visual = document.createElement('div');
    visual.className = 'galaxy-visual';
    const image = document.createElement('img');
    image.src = card.image;
    image.alt = ko
      ? `${t(`galaxy.${stage}.title`)} 상상도`
      : `${t(`galaxy.${stage}.title`)} artist’s impression`;
    image.decoding = 'async';
    visual.append(image, this.label(`${t('galaxy.artist')} · ${card.credit}`, 'galaxy-art-label'));
    if (card.sun) visual.append(this.label(card.sun[ko ? 'ko' : 'en'], 'galaxy-sun-note'));

    const copy = document.createElement('div');
    copy.className = 'galaxy-copy';
    const body = document.createElement('p');
    body.textContent = t(`galaxy.${stage}.body`);
    const limit = document.createElement('p');
    limit.className = 'galaxy-limit';
    limit.textContent = t(`galaxy.${stage}.note`);
    const meta = document.createElement('div');
    meta.className = 'galaxy-meta';
    meta.append(
      this.link(card.source, t('galaxy.source')),
      ...(card.facts ? [this.link(card.facts, t('galaxy.facts'))] : []),
      this.link(card.licence, t('galaxy.licence')),
      this.label(`${ko ? '공개일' : 'Released'} · ${card.released}`, 'galaxy-release'),
    );
    copy.append(body, limit, meta);
    article.append(visual, copy);
    this.root.replaceChildren(article);
  },

  paintHeading(prefix) {
    const kicker = this.intro.querySelector('.scene-kicker');
    const title = this.intro.querySelector('h2');
    const status = this.intro.querySelector('.scene-status');
    if (kicker) kicker.textContent = t(`${prefix}.kicker`);
    if (title) title.textContent = t(`${prefix}.title`);
    if (status) {
      status.textContent = prefix.startsWith('galaxy.') ? '' : t(`${prefix}.status`);
      status.hidden = prefix.startsWith('galaxy.');
    }
  },

  label(text, className) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  },

  link(url, text) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `${text} ↗`;
    return link;
  },
};
