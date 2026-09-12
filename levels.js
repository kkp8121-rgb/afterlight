(function (root) {
  'use strict';

  // All gameplay numbers live here so the presentation can tune around one source of truth.
  var tuning = {
    playerWidth: 24,
    playerHeight: 34,
    moveSpeed: 218,
    moveAcceleration: 1700,
    moveFriction: 2200,
    gravity: 1450,
    jumpSpeed: 510,
    jumpCutGravity: 2350,
    maxFallSpeed: 760,
    coyoteTime: 0.105,
    jumpBufferTime: 0.12,
    tapeSeconds: 3,
    tapeMinimumSeconds: 0.42,
    echoSeconds: 14,
    echoHeight: 7,
    echoPadding: 7,
    historySampleSeconds: 1 / 120,
    voidMargin: 92,
    hazardPadding: 2,
    deniedCooldown: 0.55,
    respawnDelay: 0.65,
    landingTolerance: 8,
    echoLandingTolerance: 0.15,
    echoSupportTolerance: 0.5,
    collisionEpsilon: 0.01,
    supportTolerance: 2.5,
    historySampleFactor: 0.75,
    rewindSafetyIterations: 12,
    rewindSafetyStep: 4,
    velocityEpsilon: 0.01,
    seedRadius: 12,
    nominalDt: 1 / 120,
    maxStepDt: 0.05
  };

  var levels = [
    {
      id: 'first-light', name: 'First Light', subtitle: 'A step made twice',
      hint: 'Walk right, jump high, then press E. Your afterimage will hold the next step.',
      spawn: { x: 72, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 960, h: 72 },
        { x: 480, y: 326, w: 228, h: 18 },
        { x: 748, y: 402, w: 104, h: 16 }
      ],
      seeds: [{ x: 610, y: 294 }, { x: 802, y: 370 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [], decor: { chapter: 'shore', moon: 0.72 }
    },
    {
      id: 'long-memory', name: 'Long Memory', subtitle: 'The dark between steps',
      hint: 'Make one safe crossing, rewind, and use the luminous route to climb the broken span.',
      spawn: { x: 58, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 238, h: 72 },
        { x: 280, y: 428, w: 112, h: 18 },
        { x: 436, y: 382, w: 126, h: 18 },
        { x: 612, y: 336, w: 120, h: 18 },
        { x: 776, y: 468, w: 184, h: 72 },
        { x: 722, y: 414, w: 100, h: 16 }
      ],
      seeds: [{ x: 338, y: 394 }, { x: 670, y: 302 }, { x: 810, y: 380 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [], decor: { chapter: 'shore', moon: 0.6 }
    },
    {
      id: 'undertow', name: 'Undertow', subtitle: 'Below the waterline',
      hint: 'Collected light stays when you rewind. Dive for the low seed, then return to the ledge.',
      spawn: { x: 54, y: 270 },
      platforms: [
        { x: 0, y: 320, w: 300, h: 220 },
        { x: 370, y: 358, w: 100, h: 16 },
        { x: 530, y: 358, w: 100, h: 16 },
        { x: 700, y: 320, w: 260, h: 220 },
        { x: 370, y: 492, w: 180, h: 48 }
      ],
      seeds: [{ x: 430, y: 461 }, { x: 590, y: 326 }, { x: 808, y: 286 }],
      exit: { x: 860, y: 250, w: 80, h: 70 },
      hazards: [], decor: { chapter: 'flooded-stacks', moon: 0.48 }
    },
    {
      id: 'lantern-chain', name: 'Lantern Chain', subtitle: 'One memory at a time',
      hint: 'Every rewind replaces the last path. Build a short staircase, then build the next one.',
      spawn: { x: 50, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 168, h: 72 },
        { x: 236, y: 418, w: 100, h: 16 },
        { x: 390, y: 354, w: 104, h: 16 },
        { x: 548, y: 290, w: 106, h: 16 },
        { x: 706, y: 350, w: 104, h: 16 },
        { x: 832, y: 468, w: 128, h: 72 },
        { x: 788, y: 410, w: 108, h: 16 }
      ],
      seeds: [{ x: 286, y: 386 }, { x: 442, y: 322 }, { x: 600, y: 258 }, { x: 752, y: 318 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [], decor: { chapter: 'stacks', moon: 0.4 }
    },
    {
      id: 'tideworks', name: 'Tideworks', subtitle: 'The machinery remembers',
      hint: 'Watch the tide lamps. Rewind makes a safe floor wherever your feet have been.',
      spawn: { x: 48, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 190, h: 72 },
        { x: 266, y: 420, w: 106, h: 16 },
        { x: 448, y: 360, w: 116, h: 16 },
        { x: 624, y: 420, w: 108, h: 16 },
        { x: 800, y: 468, w: 160, h: 72 },
        { x: 760, y: 374, w: 112, h: 16 }
      ],
      seeds: [{ x: 318, y: 388 }, { x: 506, y: 328 }, { x: 816, y: 342 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [
        { x: 382, y: 440, w: 28, h: 28, axis: 'y', range: 52, period: 2.8, phase: 0.2 },
        { x: 580, y: 320, w: 30, h: 30, axis: 'x', range: 54, period: 2.4, phase: 1.7 },
        { x: 734, y: 430, w: 30, h: 30, axis: 'y', range: 36, period: 2.1, phase: 2.4 }
      ], decor: { chapter: 'tideworks', moon: 0.32 }
    },
    {
      id: 'cathedral-drop', name: 'Cathedral Drop', subtitle: 'Light falls farther',
      hint: 'Use Down on the old light, fall through the gallery, then climb from below.',
      spawn: { x: 56, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 214, h: 72 },
        { x: 258, y: 382, w: 152, h: 16 },
        { x: 462, y: 292, w: 150, h: 16 },
        { x: 674, y: 382, w: 126, h: 16 },
        { x: 824, y: 468, w: 136, h: 72 },
        { x: 344, y: 486, w: 270, h: 54 },
        { x: 650, y: 486, w: 170, h: 54 }
      ],
      seeds: [{ x: 326, y: 350 }, { x: 530, y: 260 }, { x: 732, y: 350 }, { x: 746, y: 452 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [
        { x: 424, y: 430, w: 26, h: 30, axis: 'y', range: 42, period: 2.6, phase: 0.8 },
        { x: 612, y: 360, w: 28, h: 28, axis: 'x', range: 36, period: 2.1, phase: 2.1 }
      ], decor: { chapter: 'cathedral', moon: 0.25 }
    },
    {
      id: 'constellation', name: 'Constellation', subtitle: 'Many ways through the dark',
      hint: 'Choose a branch, leave a bridge, and let the moving sentries pass before you follow.',
      spawn: { x: 50, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 148, h: 72 },
        { x: 190, y: 408, w: 114, h: 16 },
        { x: 190, y: 300, w: 114, h: 16 },
        { x: 362, y: 354, w: 132, h: 16 },
        { x: 548, y: 250, w: 132, h: 16 },
        { x: 548, y: 420, w: 132, h: 16 },
        { x: 736, y: 328, w: 130, h: 16 },
        { x: 842, y: 468, w: 118, h: 72 }
      ],
      seeds: [{ x: 244, y: 376 }, { x: 244, y: 268 }, { x: 428, y: 322 }, { x: 614, y: 218 }, { x: 802, y: 296 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [
        { x: 318, y: 330, w: 28, h: 28, axis: 'y', range: 58, period: 2.5, phase: 0.1 },
        { x: 500, y: 300, w: 30, h: 30, axis: 'x', range: 62, period: 3.2, phase: 1.4 },
        { x: 700, y: 372, w: 28, h: 28, axis: 'y', range: 46, period: 2.3, phase: 2.8 }
      ], decor: { chapter: 'constellation', moon: 0.18 }
    },
    {
      id: 'last-lantern', name: 'Last Lantern', subtitle: 'Walk on what you leave behind',
      hint: 'Every lesson returns here: climb, cross, drop, wait, and rewind with intention.',
      spawn: { x: 46, y: 420 },
      platforms: [
        { x: 0, y: 468, w: 150, h: 72 },
        { x: 192, y: 410, w: 110, h: 16 },
        { x: 344, y: 334, w: 122, h: 16 },
        { x: 512, y: 414, w: 112, h: 16 },
        { x: 512, y: 240, w: 122, h: 16 },
        { x: 680, y: 318, w: 120, h: 16 },
        { x: 842, y: 468, w: 118, h: 72 },
        { x: 792, y: 390, w: 106, h: 16 }
      ],
      seeds: [{ x: 246, y: 378 }, { x: 406, y: 302 }, { x: 568, y: 382 }, { x: 572, y: 208 }, { x: 738, y: 286 }, { x: 844, y: 358 }],
      exit: { x: 860, y: 378, w: 80, h: 90 },
      hazards: [
        { x: 310, y: 370, w: 28, h: 28, axis: 'x', range: 42, period: 2.6, phase: 0.9 },
        { x: 474, y: 286, w: 30, h: 30, axis: 'y', range: 44, period: 2.4, phase: 1.8 },
        { x: 640, y: 360, w: 28, h: 28, axis: 'x', range: 48, period: 2.8, phase: 2.4 },
        { x: 808, y: 430, w: 28, h: 28, axis: 'y', range: 32, period: 1.9, phase: 0.2 }
      ], decor: { chapter: 'observatory', moon: 0.1 }
    }
  ];

  var AL = { width: 960, height: 540, tuning: tuning, levels: levels };
  root.AL = AL;
  if (typeof module !== 'undefined' && module.exports) module.exports = AL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
