/* Carbon 典藏版配色引擎：
 * - 标准模式：锁定「湖镜冷白（lake）」蓝白瓷感主视觉（移除多釉色手工切换，界面清爽纯粹）
 * - 全局热力模式：开启「全局热力图」时自动切换至「深海夜航暗底（thermal）」，以深邃藏蓝三维底图烘托高亮流光热力场
 */
(function (g) {
  'use strict';

  var PALETTES = {
    lake: {
      key: 'lake',
      name: '湖镜冷白',
      sub: '冷白瓷面 · 澄澈湖蓝',
      dark: false,
      thermal: false,
      css: {
        'glaze': '#eef4f8',
        'paper': '#fbfdff',
        'paper-a': 'rgba(251, 253, 255, 0.86)',
        'paper-strong': 'rgba(252, 254, 255, 0.96)',
        'surface-2': '#f2f7fb',
        'ink': '#102536',
        'ink2': '#38556a',
        'ink3': '#648094',
        'rule': 'rgba(24, 62, 89, 0.14)',
        'rule-strong': 'rgba(24, 62, 89, 0.24)',
        'rule-soft': 'rgba(24, 62, 89, 0.08)',
        'accent': '#1f7496',
        'accent-deep': '#155672',
        'accent-soft': 'rgba(31, 116, 150, 0.12)',
        'gold': '#b8823b',
        'gold-soft': 'rgba(184, 130, 59, 0.14)',
        'warn': '#b45263',
        'warn-soft': 'rgba(180, 82, 99, 0.11)',
        'data': '#3a7d99',
        'veil-rgb': '238, 244, 248',
        'paper-rgb': '251, 253, 255',
        'shadow-rgb': '14, 38, 56',
        'specular': 'rgba(255, 255, 255, 0.92)'
      },
      heat: ['#b8d3e3', '#80b2cc', '#498eb0', '#25698c', '#104261'],
      lines: ['#286f8e', '#3d8b7d', '#5c6ba8', '#b57452', '#33889a', '#486288', '#8d6489', '#678c59', '#a6586c', '#64798a'],
      charts: {
        ink: '#102536',
        ink2: '#38556a',
        ink3: '#648094',
        rule: '#d4e2ec',
        ruleSoft: '#e7eff5',
        paper: '#fbfdff',
        seal: '#b8823b',
        accent: '#1f7496',
        warn: '#b45263',
        bar: '#2d7d9e',
        barTop: '#53a3c2',
        barSoft: '#a7cadb',
        interp: '#7d96a8',
        rank: '#1f7496',
        rankTop: '#4798b8',
        trend: '#1f7496',
        trendAreaTop: 'rgba(31, 116, 150, 0.24)',
        trendAreaBottom: 'rgba(31, 116, 150, 0.01)',
        districts: ['#237696', '#469689', '#5675ab', '#7c6da8', '#b26b7c', '#5b8e72', '#7e99ad', '#b88856']
      },
      periods: ['#9ebcd0', '#d09748', '#2e819f', '#596da3'],
      city: {
        skyTop: '#fbfdff',
        skyMid: '#edf4fa',
        skyBottom: '#dce9f3',
        fog: 0xe6eff6,
        ground: 0xeaf1f6,
        gridMinor: 0xdce7ef,
        gridMajor: 0xcbdbe6,
        waterDeep: 0x7eaac4,
        waterShallow: 0xa4cadf,
        waterSpec: 0xeaf6fc,
        shore: 0x5c8da8,
        shoreGlow: 0xd3e8f4,
        mountain: 0xdbe6ee,
        mountainTop: 0xedf3f8,
        contour: 0x9ab2c3,
        building: 0xf9fcff,
        buildingBase: 0xd5e3ee,
        buildingEdge: 0xc2d5e3,
        road: 0xc8d7e3,
        roadMain: 0xa8bfd0,
        roadCasing: 0xdfeaf2,
        bridge: 0xf4f8fc,
        ink: 0x102536,
        seal: 0xb8823b,
        accent: 0x1f7496,
        district: 0x628096,
        glaze: 0xeef4f8,
        island: 0xe4eef4,
        park: 0xdcebe6,
        landmark: 0xffffff,
        landmarkEdge: 0x8fb0c7,
        skyLight: 0xffffff,
        groundLight: 0xb9cedd,
        sun: 0xfffaf2,
        tileTint: '#e9f2f8',
        crown: 0xffffff
      }
    },

    thermal: {
      key: 'thermal',
      name: '暗夜热力场',
      sub: '深蓝底图 · 炽亮热力核',
      dark: true,
      thermal: true,
      css: {
        'glaze': '#07111d',
        'paper': '#0d1b2d',
        'paper-a': 'rgba(11, 23, 39, 0.85)',
        'paper-strong': 'rgba(12, 25, 42, 0.95)',
        'surface-2': '#13263d',
        'ink': '#eaf4fc',
        'ink2': '#a2bfd6',
        'ink3': '#698ba6',
        'rule': 'rgba(110, 178, 224, 0.18)',
        'rule-strong': 'rgba(110, 178, 224, 0.32)',
        'rule-soft': 'rgba(110, 178, 224, 0.10)',
        'accent': '#38c8f2',
        'accent-deep': '#1ca0cc',
        'accent-soft': 'rgba(56, 200, 242, 0.16)',
        'gold': '#ffb84d',
        'gold-soft': 'rgba(255, 184, 77, 0.18)',
        'warn': '#f07d8c',
        'warn-soft': 'rgba(240, 125, 140, 0.16)',
        'data': '#38c8f2',
        'veil-rgb': '7, 17, 29',
        'paper-rgb': '13, 27, 45',
        'shadow-rgb': '1, 5, 12',
        'specular': 'rgba(170, 225, 255, 0.14)'
      },
      heat: ['#156599', '#19b5d8', '#6be8b5', '#ffb340', '#fff4cc'],
      lines: ['#38c8f2', '#52d6b4', '#8695f5', '#f2a16b', '#4eb8de', '#78a3e6', '#d689c7', '#8ed479', '#eb7f90', '#8ca8bf'],
      charts: {
        ink: '#eaf4fc',
        ink2: '#a2bfd6',
        ink3: '#698ba6',
        rule: '#1d344d',
        ruleSoft: '#15283c',
        paper: '#0d1b2d',
        seal: '#ffb84d',
        accent: '#38c8f2',
        warn: '#f07d8c',
        bar: '#2dbbe6',
        barTop: '#80e5ff',
        barSoft: '#1e4663',
        interp: '#698ba6',
        rank: '#38c8f2',
        rankTop: '#ffb84d',
        trend: '#38c8f2',
        trendAreaTop: 'rgba(56, 200, 242, 0.28)',
        trendAreaBottom: 'rgba(56, 200, 242, 0.01)',
        districts: ['#38c8f2', '#54d1ab', '#7c93ed', '#ab88eb', '#eb839a', '#6fc789', '#7aa6c2', '#f0b165']
      },
      periods: ['#255370', '#ffb340', '#38c8f2', '#798ce6'],
      city: {
        skyTop: '#040a12',
        skyMid: '#071220',
        skyBottom: '#0d1e32',
        fog: 0x081321,
        ground: 0x081320,
        gridMinor: 0x0f2033,
        gridMajor: 0x162e47,
        waterDeep: 0x051526,
        waterShallow: 0x0b2944,
        waterSpec: 0x38c8f2,
        shore: 0x226089,
        shoreGlow: 0x143e5c,
        mountain: 0x0e2034,
        mountainTop: 0x17324e,
        contour: 0x294f73,
        building: 0x1d3652,
        buildingBase: 0x0d1c2e,
        buildingEdge: 0x2b5075,
        road: 0x162e48,
        roadMain: 0x24496f,
        roadCasing: 0x0e1f33,
        bridge: 0x294f75,
        ink: 0xffb84d,
        seal: 0xffb84d,
        accent: 0x38c8f2,
        district: 0x2f5678,
        glaze: 0x07111d,
        island: 0x102438,
        park: 0x0f272e,
        landmark: 0x26486b,
        landmarkEdge: 0x5cd0f5,
        skyLight: 0x9bd0ff,
        groundLight: 0x193452,
        sun: 0xd6eeff,
        tileTint: '#102236',
        crown: 0xfff8dc
      }
    }
  };

  function applyPalette(key) {
    var p = PALETTES[key] || PALETTES.lake;
    g.HZ_PALETTE = p;
    g.HZ_PALETTES = PALETTES;
    var root = document.documentElement;
    root.dataset.palette = p.key;
    root.style.colorScheme = p.dark ? 'dark' : 'light';
    Object.keys(p.css).forEach(function (k) {
      root.style.setProperty('--' + k, p.css[k]);
    });
    return p;
  }

  g.HZ_SET_PALETTE = applyPalette;
  applyPalette('lake');
})(window);
