// Liquid glass renderer.
//
// A three.js scene of wireframe polyhedra drifts in zero gravity behind the
// page: cannon-es simulates them as convex rigid bodies that bounce off each
// other and the edges of the screen, and the pointer is an invisible body
// that pushes them around. Bodies close to each other are linked by faint
// lines, so the scene reads as a network whose shape keeps changing.
//
// The scene is rendered into an offscreen texture, and then composited to the
// screen. Every element marked with a data-glass attribute is rendered as a
// pane of glass over that texture: the rim refracts what is behind it, with a
// little chromatic split and a specular highlight that follows the pointer.
//
//   data-glass="clear"    controls (nav, dock, arrows): lensed, lightly tinted
//   data-glass="frosted"  reading surfaces (cards): blurred and tinted
//   data-glass="drop"     the active-nav indicator: strongest lens, brightest
//
// Glass panes are located with getBoundingClientRect every frame, so the DOM
// stays the source of truth for layout, scrolling and CSS transitions. Panes
// inside .card-container-home are clipped to it and faded at its edges to
// match its CSS mask. Without WebGL2 (or if this module fails to load) the
// page falls back to CSS backdrop blur.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const MAX_PANES = 24;
const MAX_BODIES = 16;
const KIND = { clear: 0, frosted: 1, drop: 2 };

// Palette (keep in sync with the tokens at the top of style.css). Colors are
// used as-is, without three.js color management, so they match the CSS.
const BACKGROUND = 0x000000;
const TINT = 0x000000;
const HUES = [0xf4a93b, 0xf07167, 0x2ec4b6, 0x9d7cf2, 0x7fb8ff]; // marigold, coral, lagoon, iris, sky

// Scene layout
const CAMERA_Z = 16;
const FOV = 40;
const Z_BACK = -3.5;
const Z_FRONT = 2.5;
const LINK_DISTANCE = 5.2;

// Spin, in radians per second. Bodies get extra rotational inertia so
// collisions put little spin into them; a hit can still push a body past its
// cruising spin, up to a hard ceiling, and the excess then bleeds away over
// about a second, so hits read as a slow tumble rather than a spinning top.
const MIN_SPIN = 0.08;
const MAX_SPIN = 0.35;
const HARD_SPIN = 1.0;
const SPIN_SETTLE_RATE = 2;
const INERTIA_SCALE = 4;

// Fastest the pointer body moves, in scene units per second, so a flick of
// the mouse nudges bodies instead of batting them away
const POINTER_SPEED = 8;

THREE.ColorManagement.enabled = false;

// Small seeded PRNG so the opening arrangement is the same on every visit
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- shapes

// A brilliant-cut diamond: table, crown, girdle and pavilion point
function diamondGeometry() {
    const pts = [];
    const ring = (n, r, y, offset) => {
        for (let i = 0; i < n; i++) {
            const a = (i + offset) / n * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
        }
    };
    ring(8, 0.42, 0.34, 0);
    ring(16, 0.78, 0.08, 0.5);
    ring(16, 0.8, 0.0, 0);
    pts.push(new THREE.Vector3(0, -0.72, 0));
    const g = new ConvexGeometry(pts);
    g.center();
    return g;
}

// Every shape is convex, so the same hull drives both drawing and physics
const SHAPES = [
    () => new THREE.IcosahedronGeometry(0.72),
    () => new THREE.OctahedronGeometry(0.8),
    () => new THREE.DodecahedronGeometry(0.72),
    () => new THREE.TetrahedronGeometry(0.85),
    () => new THREE.ConeGeometry(0.7, 0.8, 6, 1),
    () => new THREE.ConeGeometry(0.7, 0.8, 7, 1),
    () => new THREE.ConeGeometry(0.7, 0.8, 8, 1),
    () => new THREE.BoxGeometry(0.85, 0.85, 0.85),
    () => new THREE.CylinderGeometry(0.5, 0.5, 0.95, 6, 1),
    diamondGeometry
];

// Merged vertices and triangle faces for cannon's ConvexPolyhedron
function hullOf(geometry) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geometry.getAttribute('position').clone());
    if (geometry.index) g.setIndex(geometry.index.clone());
    const merged = mergeVertices(g, 1e-4);
    const pos = merged.getAttribute('position');
    const vertices = [];
    for (let i = 0; i < pos.count; i++) {
        vertices.push(new CANNON.Vec3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    const faces = [];
    const idx = merged.index.array;
    for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        // Merging collapses the duplicated apex of a cone into degenerate triangles
        if (a !== b && b !== c && a !== c) faces.push([a, b, c]);
    }
    return { vertices, faces, points: pos.array.slice() };
}

// ---------------------------------------------------------------- shaders

const FULLSCREEN_VS = `
    in vec3 position;
    out vec2 vUv;
    void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }`;

// Gradient backdrop with a soft glow of each body's color behind it
const BACKDROP_FS = `
    precision highp float;
    #define MAX_BODIES ${MAX_BODIES}
    in vec2 vUv;
    out vec4 outColor;
    uniform float uAspect;
    uniform vec3 uTop;
    uniform vec3 uBottom;
    uniform int uGlowCount;
    uniform vec3 uGlow[MAX_BODIES];       // uv x, uv y, radius (in screen heights)
    uniform vec3 uGlowColor[MAX_BODIES];
    void main() {
        vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
        for (int i = 0; i < MAX_BODIES; i++) {
            if (i >= uGlowCount) break;
            vec2 d = (vUv - uGlow[i].xy) * vec2(uAspect, 1.0) / uGlow[i].z;
            col += uGlowColor[i] * 0.13 * exp(-dot(d, d));
        }
        outColor = vec4(col, 1.0);
    }`;

// Faces: nearly invisible head-on, glowing at grazing angles
const FACE_VS = `
    varying vec3 vNormal;
    varying vec3 vView;
    varying float vFade;
    void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vFade = 1.0 - smoothstep(13.0, 21.0, -mv.z) * 0.55;
        gl_Position = projectionMatrix * mv;
    }`;

const FACE_FS = `
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vView;
    varying float vFade;
    void main() {
        float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float a = (0.035 + 0.2 * f * f) * vFade;
        gl_FragColor = vec4(uColor * a, a);
    }`;

// Vertices: a bright core with a small halo, sized by distance
const POINT_VS = `
    uniform float uSize;
    varying float vFade;
    void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFade = 1.0 - smoothstep(13.0, 21.0, -mv.z) * 0.55;
        gl_PointSize = uSize / -mv.z;
        gl_Position = projectionMatrix * mv;
    }`;

const POINT_FS = `
    uniform vec3 uColor;
    varying float vFade;
    void main() {
        float d = length(gl_PointCoord * 2.0 - 1.0);
        float core = 1.0 - smoothstep(0.22, 0.32, d);
        float halo = exp(-d * d * 7.0) * 0.5 * (1.0 - smoothstep(0.75, 1.0, d));
        float a = max(core, halo) * vFade;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.35) * a, a);
    }`;

const BLUR_FS = `
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uSrc;
    uniform vec2 uStep;
    uniform float uLod;
    void main() {
        float w[5] = float[](0.2270, 0.1945, 0.1216, 0.0540, 0.0162);
        vec3 c = textureLod(uSrc, vUv, uLod).rgb * w[0];
        for (int i = 1; i < 5; i++) {
            vec2 o = uStep * float(i);
            c += textureLod(uSrc, vUv + o, uLod).rgb * w[i];
            c += textureLod(uSrc, vUv - o, uLod).rgb * w[i];
        }
        outColor = vec4(c, 1.0);
    }`;

const COMPOSITE_FS = `
    precision highp float;
    #define MAX_PANES ${MAX_PANES}
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uBg;
    uniform sampler2D uBlur;
    uniform vec2 uRes;
    uniform float uDpr;
    uniform int uCount;
    uniform vec4 uRect[MAX_PANES];   // x, y, w, h in device px, origin bottom-left
    uniform vec4 uPane[MAX_PANES];   // radius, kind, clipped, opacity
    uniform float uLift[MAX_PANES];  // 0..1 hover/focus response
    uniform vec4 uClip;              // scroll container, same space as uRect
    uniform vec2 uLight;             // direction towards the light
    uniform vec3 uTint;

    float sdRoundBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    // Matches the mask-image on .card-container-home
    float clipFade(vec2 f) {
        if (f.x < uClip.x || f.x > uClip.x + uClip.z) return 0.0;
        float top = uClip.y + uClip.w;
        return smoothstep(0.0, 24.0 * uDpr, top - f.y) * smoothstep(0.0, 48.0 * uDpr, f.y - uClip.y);
    }

    vec3 sampleSplit(sampler2D tex, vec2 q, vec2 split, float lod) {
        vec2 px = 1.0 / uRes;
        return vec3(
            textureLod(tex, (q + split) * px, lod).r,
            textureLod(tex, q * px, lod).g,
            textureLod(tex, (q - split) * px, lod).b
        );
    }

    void main() {
        vec2 f = gl_FragCoord.xy;
        vec3 col = texture(uBg, vUv).rgb;

        // Find the topmost pane under this pixel and accumulate soft shadows
        int hit = -1;
        float hitOpacity = 0.0;
        float shadow = 0.0;
        for (int i = 0; i < MAX_PANES; i++) {
            if (i >= uCount) break;
            vec4 r = uRect[i];
            vec4 p = uPane[i];
            float opacity = p.w;
            if (p.z > 0.5) opacity *= clipFade(f);
            if (opacity < 0.002) continue;
            vec2 hb = r.zw * 0.5;
            vec2 c = r.xy + hb;
            if (sdRoundBox(f - c, hb, p.x) < 1.0) {
                hit = i;
                hitOpacity = opacity;
            }
            float ds = sdRoundBox(f - c + vec2(0.0, 10.0 * uDpr), hb, p.x);
            float strength = p.y > 0.5 && p.y < 1.5 ? 0.32 : 0.2;
            shadow = max(shadow, opacity * strength * (1.0 - smoothstep(-6.0 * uDpr, 30.0 * uDpr, ds)));
        }
        col *= 1.0 - shadow;

        if (hit >= 0) {
            vec4 r = uRect[hit];
            vec4 p = uPane[hit];
            float lift = uLift[hit];
            vec2 hb = r.zw * 0.5;
            vec2 c = r.xy + hb;
            vec2 lp = f - c;
            float rad = p.x;
            float d = sdRoundBox(lp, hb, rad);
            float depth = -d;

            vec2 e = vec2(1.0, 0.0);
            vec2 n = vec2(
                sdRoundBox(lp + e.xy, hb, rad) - sdRoundBox(lp - e.xy, hb, rad),
                sdRoundBox(lp + e.yx, hb, rad) - sdRoundBox(lp - e.yx, hb, rad)
            );
            n /= max(length(n), 1e-4);

            bool frosted = p.y > 0.5 && p.y < 1.5;
            bool drop = p.y > 1.5;

            // Bevel: a thick rim on reading panes, a fully rounded lens on controls
            float bevel = frosted ? 24.0 * uDpr : min(min(hb.x, hb.y), 22.0 * uDpr);
            bevel = max(bevel, 1.0);
            float x = clamp(1.0 - depth / bevel, 0.0, 1.0);
            float strength = (frosted ? 22.0 : drop ? 16.0 : 26.0) * uDpr * (1.0 + 0.45 * lift);
            float bend = strength * x * x;

            // Controls also magnify slightly, like a lens resting on the page
            float magnify = frosted ? 1.0 : 0.93;
            vec2 q = c + lp * magnify + n * bend;
            vec2 split = n * bend * 0.09;

            vec3 g;
            if (frosted) {
                // Frosted in the middle, but the rim stays clear enough
                // to show the scene bending around the edge
                vec3 frost = sampleSplit(uBlur, q, split, 0.0);
                vec3 rim = sampleSplit(uBg, q, split, 0.6);
                g = mix(frost, rim, pow(x, 1.6) * 0.85);
            } else {
                g = sampleSplit(uBg, q, split, drop ? 0.4 : 1.2);
            }

            if (frosted) {
                g = mix(g, uTint, 0.30) * 1.03 + 0.02;
                g += 0.025 * (lp.y / hb.y);
            } else if (drop) {
                g = g * 1.12 + 0.08;
            } else {
                g = mix(g, uTint, 0.22) + 0.035;
            }
            float lum = dot(g, vec3(0.2126, 0.7152, 0.0722));
            g = mix(vec3(lum), g, 1.15);

            // Specular: a crisp edge line, strongest facing the light,
            // with a fainter answer on the far side, plus a broad sheen
            float ld = dot(n, uLight);
            float edge = 1.0 - smoothstep(0.0, 1.6 * uDpr, depth);
            float band = 1.0 - smoothstep(0.0, bevel, depth);
            float spec = edge * (0.22 + 0.6 * max(ld, 0.0) + 0.28 * max(-ld, 0.0));
            spec += band * band * 0.16 * max(ld, 0.0);
            spec *= 0.85 + 0.55 * lift;
            g += spec;
            g *= 1.0 - 0.12 * band * max(-ld, 0.0);

            float coverage = clamp(0.5 - d, 0.0, 1.0);
            col = mix(col, g, coverage * hitOpacity);
        }

        outColor = vec4(col, 1.0);
    }`;

function rawMaterial(fragmentShader, uniforms) {
    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: FULLSCREEN_VS,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending
    });
}

const premultiplied = {
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor
};

// ---------------------------------------------------------------- renderer

function start() {
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (err) {
        canvas.remove();
        return;
    }
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.autoClear = false;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const rand = mulberry32(20260928);

    // ------------------------------------------------ scene

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);

    const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: FULLSCREEN_VS,
            fragmentShader: BACKDROP_FS,
            uniforms: {
                uAspect: { value: 1 },
                uTop: { value: new THREE.Color(BACKGROUND) },
                uBottom: { value: new THREE.Color(BACKGROUND) },
                uGlowCount: { value: 0 },
                uGlow: { value: new Float32Array(MAX_BODIES * 3) },
                uGlowColor: { value: new Float32Array(MAX_BODIES * 3) }
            },
            depthTest: false,
            depthWrite: false
        })
    );
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -1;
    scene.add(backdrop);

    const hueColors = HUES.map(h => new THREE.Color(h));
    const lineMaterials = HUES.map(h => new LineMaterial({
        color: h,
        linewidth: 1.4,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
    }));
    const faceMaterials = hueColors.map(c => new THREE.ShaderMaterial({
        vertexShader: FACE_VS,
        fragmentShader: FACE_FS,
        uniforms: { uColor: { value: c } },
        side: THREE.DoubleSide,
        ...premultiplied
    }));
    const pointMaterials = hueColors.map(c => new THREE.ShaderMaterial({
        vertexShader: POINT_VS,
        fragmentShader: POINT_FS,
        uniforms: { uColor: { value: c }, uSize: { value: 190 } },
        ...premultiplied
    }));

    // ------------------------------------------------ physics

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    const bodyMaterial = new CANNON.Material('body');
    const wallMaterial = new CANNON.Material('wall');
    world.addContactMaterial(new CANNON.ContactMaterial(bodyMaterial, bodyMaterial, { friction: 0.05, restitution: 0.85 }));
    world.addContactMaterial(new CANNON.ContactMaterial(bodyMaterial, wallMaterial, { friction: 0.0, restitution: 0.95 }));

    // Six invisible walls: the visible frustum at z = 0, and a shallow depth range
    const walls = [
        new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-1, 0, 0),
        new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, -1, 0),
        new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -1)
    ].map((normal) => {
        const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMaterial });
        body.addShape(new CANNON.Plane());
        // A plane's normal is +Z in its own frame; turn it to face inwards
        body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
        world.addBody(body);
        return body;
    });

    let halfW = 1, halfH = 1;
    function placeWalls() {
        halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
        halfW = halfH * camera.aspect;
        const [left, right, bottom, top, back, front] = walls;
        left.position.set(-halfW, 0, 0);
        right.position.set(halfW, 0, 0);
        bottom.position.set(0, -halfH, 0);
        top.position.set(0, halfH, 0);
        back.position.set(0, 0, Z_BACK);
        front.position.set(0, 0, Z_FRONT);
    }

    // The pointer is a kinematic sphere on the z = 0 plane
    const pointer = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: bodyMaterial });
    pointer.addShape(new CANNON.Sphere(0.9));
    pointer.position.set(0, 0, 100);
    world.addBody(pointer);
    const pointerTarget = new THREE.Vector3(0, 0, 100);
    let pointerActive = false;

    // ------------------------------------------------ bodies

    const bodies = [];

    function buildBodies() {
        const portrait = window.innerWidth < window.innerHeight;
        const count = portrait ? 8 : 14;
        const sizeScale = portrait ? 0.8 : 1;
        const placed = [];

        for (let i = 0; i < count; i++) {
            const shape = SHAPES[i % SHAPES.length];
            const hue = i % HUES.length;
            const scale = (0.75 + rand() * 0.6) * sizeScale;
            const geometry = shape();
            geometry.scale(scale, scale, scale);
            if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
            const hull = hullOf(geometry);

            // Drawing: faint faces, crisp edges, glowing vertices
            const group = new THREE.Group();
            group.add(new THREE.Mesh(geometry, faceMaterials[hue]));
            const edges = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry, 1));
            group.add(new LineSegments2(edges, lineMaterials[hue]));
            const vertexGeometry = new THREE.BufferGeometry();
            vertexGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hull.points, 3));
            group.add(new THREE.Points(vertexGeometry, pointMaterials[hue]));
            scene.add(group);

            // Physics: the same hull as a convex rigid body
            const body = new CANNON.Body({
                mass: scale * scale * scale,
                material: bodyMaterial,
                linearDamping: 0.02,
                angularDamping: 0.02
            });
            body.addShape(new CANNON.ConvexPolyhedron({ vertices: hull.vertices, faces: hull.faces }));
            body.inertia.scale(INERTIA_SCALE, body.inertia);
            body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
            body.updateInertiaWorld(true);

            // Spread the opening arrangement out so nothing starts overlapping
            let pos;
            for (let tries = 0; tries < 40; tries++) {
                pos = new CANNON.Vec3(
                    (rand() * 2 - 1) * (halfW - 1.2),
                    (rand() * 2 - 1) * (halfH - 1.2),
                    Z_BACK + 1 + rand() * (Z_FRONT - Z_BACK - 2)
                );
                if (placed.every(p => p.distanceTo(pos) > 2.2)) break;
            }
            placed.push(pos);
            body.position.copy(pos);
            body.quaternion.setFromEuler(rand() * 6.28, rand() * 6.28, rand() * 6.28);
            const speed = 0.35 + rand() * 0.5;
            const dir = new CANNON.Vec3(rand() * 2 - 1, rand() * 2 - 1, (rand() * 2 - 1) * 0.3);
            dir.normalize();
            body.velocity.copy(dir.scale(speed));
            body.angularVelocity.set((rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4);
            world.addBody(body);

            bodies.push({ body, group, hue, scale });
        }
    }

    // The hard ceiling applies after every physics substep, so a hit never
    // carries a burst of spin into the next one
    world.addEventListener('postStep', () => {
        for (const { body } of bodies) {
            const spin = body.angularVelocity.length();
            if (spin > HARD_SPIN) body.angularVelocity.scale(HARD_SPIN / spin, body.angularVelocity);
        }
    });

    // Zero gravity with a little damping would eventually stop everything, so
    // slow bodies get a nudge and fast ones (flung by the pointer) are reined in
    function keepDrifting(dt) {
        for (const { body } of bodies) {
            const v = body.velocity;
            const speed = v.length();
            if (speed < 0.25) {
                v.x += (rand() - 0.5) * 0.08;
                v.y += (rand() - 0.5) * 0.08;
                v.z += (rand() - 0.5) * 0.03;
            } else if (speed > 4) {
                v.scale(0.97, v);
            }
            const w = body.angularVelocity;
            const spin = w.length();
            if (spin > MAX_SPIN) {
                const settled = MAX_SPIN + (spin - MAX_SPIN) * Math.exp(-SPIN_SETTLE_RATE * dt);
                w.scale(settled / spin, w);
            } else if (spin < MIN_SPIN) {
                w.x += (rand() - 0.5) * 0.03;
                w.y += (rand() - 0.5) * 0.03;
            }
        }
    }

    // ------------------------------------------------ links between nearby bodies

    // Drawn additively, so a link fades out by darkening its color
    const MAX_LINKS = MAX_BODIES * 4;
    const linkGeometry = new LineSegmentsGeometry();
    linkGeometry.setPositions(new Float32Array(MAX_LINKS * 6));
    linkGeometry.setColors(new Float32Array(MAX_LINKS * 6));
    const linkPositions = linkGeometry.attributes.instanceStart.data;
    const linkColors = linkGeometry.attributes.instanceColorStart.data;
    const linkMaterial = new LineMaterial({
        vertexColors: true,
        linewidth: 1.1,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const links = new LineSegments2(linkGeometry, linkMaterial);
    links.frustumCulled = false;
    scene.add(links);

    function updateLinks() {
        let n = 0;
        for (let i = 0; i < bodies.length && n < MAX_LINKS; i++) {
            for (let j = i + 1; j < bodies.length && n < MAX_LINKS; j++) {
                const a = bodies[i].body.position, b = bodies[j].body.position;
                const d = a.distanceTo(b);
                if (d > LINK_DISTANCE) continue;
                const k = Math.pow(1 - d / LINK_DISTANCE, 1.2) * 0.8;
                const ca = hueColors[bodies[i].hue], cb = hueColors[bodies[j].hue];
                linkPositions.array.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6);
                linkColors.array.set([ca.r * k, ca.g * k, ca.b * k, cb.r * k, cb.g * k, cb.b * k], n * 6);
                n++;
            }
        }
        linkGeometry.instanceCount = n;
        linkPositions.needsUpdate = true;
        linkColors.needsUpdate = true;
    }

    // ------------------------------------------------ glows behind bodies

    const glow = backdrop.material.uniforms;
    const projected = new THREE.Vector3();
    function updateGlows() {
        let n = 0;
        for (const { body, hue, scale } of bodies) {
            if (n >= MAX_BODIES) break;
            projected.set(body.position.x, body.position.y, body.position.z).project(camera);
            const distance = CAMERA_Z - body.position.z;
            glow.uGlow.value.set([projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5, scale * 2.6 / distance], n * 3);
            const c = hueColors[hue];
            glow.uGlowColor.value.set([c.r, c.g, c.b], n * 3);
            n++;
        }
        glow.uGlowCount.value = n;
    }

    // ------------------------------------------------ passes

    const fullscreen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    fullscreen.frustumCulled = false;
    const passScene = new THREE.Scene();
    passScene.add(fullscreen);
    const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const blurMaterial = rawMaterial(BLUR_FS, {
        uSrc: { value: null },
        uStep: { value: new THREE.Vector2() },
        uLod: { value: 0 }
    });
    const compositeMaterial = rawMaterial(COMPOSITE_FS, {
        uBg: { value: null },
        uBlur: { value: null },
        uRes: { value: new THREE.Vector2() },
        uDpr: { value: 1 },
        uCount: { value: 0 },
        uRect: { value: new Float32Array(MAX_PANES * 4) },
        uPane: { value: new Float32Array(MAX_PANES * 4) },
        uLift: { value: new Float32Array(MAX_PANES) },
        uClip: { value: new THREE.Vector4() },
        uLight: { value: new THREE.Vector2(-0.45, 0.89) },
        uTint: { value: new THREE.Color(TINT) }
    });

    let dpr = 1, width = 0, height = 0;
    let bgTarget, blurA, blurB;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        placeWalls();

        const bgScale = Math.min(dpr, 1.5);
        const bw = Math.max(4, Math.round(width * bgScale));
        const bh = Math.max(4, Math.round(height * bgScale));
        [bgTarget, blurA, blurB].forEach(t => t && t.dispose());
        bgTarget = new THREE.WebGLRenderTarget(bw, bh, {
            samples: 4,
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
            magFilter: THREE.LinearFilter
        });
        const qw = Math.max(1, bw >> 2), qh = Math.max(1, bh >> 2);
        blurA = new THREE.WebGLRenderTarget(qw, qh, { depthBuffer: false });
        blurB = new THREE.WebGLRenderTarget(qw, qh, { depthBuffer: false });

        [...lineMaterials, linkMaterial].forEach(m => m.resolution.set(bw, bh));
        pointMaterials.forEach(m => { m.uniforms.uSize.value = 190 * bgScale; });
        backdrop.material.uniforms.uAspect.value = width / height;
    }
    resize();
    buildBodies();
    window.addEventListener('resize', resize);

    // ------------------------------------------------ input

    const light = { x: -0.45, y: 0.89, tx: -0.45, ty: 0.89 };
    const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    const unprojected = new THREE.Vector3();

    window.addEventListener('pointermove', (e) => {
        const dx = e.clientX - width / 2;
        const dy = height / 2 - e.clientY;
        const len = Math.hypot(dx, dy) || 1;
        // Keep the light mostly overhead-left; the pointer only steers it
        light.tx = 0.55 * (dx / len) + 0.45 * -0.45;
        light.ty = 0.55 * (dy / len) + 0.45 * 0.89;
        parallax.tx = dx / width;
        parallax.ty = dy / height;

        // Where the pointer ray meets the z = 0 plane
        unprojected.set(e.clientX / width * 2 - 1, -(e.clientY / height) * 2 + 1, 0.5).unproject(camera);
        unprojected.sub(camera.position).normalize();
        const t = -camera.position.z / unprojected.z;
        pointerTarget.copy(camera.position).addScaledVector(unprojected, t);
        if (!pointerActive) pointer.position.set(pointerTarget.x, pointerTarget.y, 0);
        pointerActive = true;
    }, { passive: true });

    const parkPointer = () => {
        pointerActive = false;
        pointer.position.set(0, 0, 100);
        pointer.velocity.set(0, 0, 0);
    };
    document.documentElement.addEventListener('pointerleave', parkPointer);
    window.addEventListener('blur', parkPointer);

    const lift = new WeakMap();
    let hovered = null;
    function setHovered(el) {
        if (hovered === el) return;
        if (hovered && lift.has(hovered)) lift.get(hovered).target = 0;
        hovered = el;
        if (el) {
            if (!lift.has(el)) lift.set(el, { value: 0, target: 0 });
            lift.get(el).target = 1;
        }
    }
    document.addEventListener('pointerover', (e) => setHovered(e.target.closest('[data-glass]')));
    document.documentElement.addEventListener('pointerleave', () => setHovered(null));
    document.addEventListener('focusin', (e) => setHovered(e.target.closest('[data-glass]')));

    // ------------------------------------------------ panes

    const cu = compositeMaterial.uniforms;
    const rects = cu.uRect.value;
    const panes = cu.uPane.value;
    const lifts = cu.uLift.value;

    function collectPanes() {
        const container = document.querySelector('.card-container-home');
        let containerOpacity = 1;
        if (container) {
            const cr = container.getBoundingClientRect();
            cu.uClip.value.set(cr.left * dpr, (height - cr.bottom) * dpr, cr.width * dpr, cr.height * dpr);
            containerOpacity = parseFloat(getComputedStyle(container).opacity);
        }

        let count = 0;
        const snap = reducedMotion.matches;
        for (const el of document.querySelectorAll('[data-glass]')) {
            if (count >= MAX_PANES) break;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            if (r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden') continue;

            const clipped = container && container.contains(el);
            const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
            const state = lift.get(el);
            let l = 0;
            if (state) {
                state.value = snap ? state.target : state.value + (state.target - state.value) * 0.14;
                l = state.value;
            }

            const o = count * 4;
            rects[o] = r.left * dpr;
            rects[o + 1] = (height - r.bottom) * dpr;
            rects[o + 2] = r.width * dpr;
            rects[o + 3] = r.height * dpr;
            panes[o] = radius * dpr;
            panes[o + 1] = KIND[el.dataset.glass] ?? KIND.frosted;
            panes[o + 2] = clipped ? 1 : 0;
            panes[o + 3] = parseFloat(cs.opacity) * (clipped ? containerOpacity : 1);
            lifts[count] = l;
            count++;
        }
        return count;
    }

    // ------------------------------------------------ frame

    let last = performance.now();
    let lost = false;

    function frame(now) {
        const dt = Math.min((now - last) / 1000, 1 / 20);
        last = now;
        const still = reducedMotion.matches;

        // 1. Physics
        if (!still && dt > 0) {
            if (pointerActive) {
                const p = pointer.position;
                pointer.velocity.set(
                    THREE.MathUtils.clamp((pointerTarget.x - p.x) / dt, -POINTER_SPEED, POINTER_SPEED),
                    THREE.MathUtils.clamp((pointerTarget.y - p.y) / dt, -POINTER_SPEED, POINTER_SPEED),
                    -p.z / dt
                );
            }
            world.step(1 / 60, dt, 3);
            keepDrifting(dt);
        }
        for (const { body, group } of bodies) {
            group.position.copy(body.position);
            group.quaternion.copy(body.quaternion);
        }

        // 2. Camera drifts a little with the pointer for depth
        if (!still) {
            parallax.x += (parallax.tx - parallax.x) * 0.03;
            parallax.y += (parallax.ty - parallax.y) * 0.03;
        }
        camera.position.set(parallax.x * 0.9, parallax.y * 0.6, CAMERA_Z);
        camera.lookAt(0, 0, 0);

        updateLinks();
        updateGlows();

        // 3. Scene into the background texture
        renderer.setRenderTarget(bgTarget);
        renderer.clear();
        renderer.render(scene, camera);

        // 4. Two-pass Gaussian at quarter resolution for frosted panes
        fullscreen.material = blurMaterial;
        blurMaterial.uniforms.uSrc.value = bgTarget.texture;
        blurMaterial.uniforms.uLod.value = 2;
        blurMaterial.uniforms.uStep.value.set(1.6 / blurA.width, 0);
        renderer.setRenderTarget(blurA);
        renderer.render(passScene, passCamera);

        blurMaterial.uniforms.uSrc.value = blurA.texture;
        blurMaterial.uniforms.uLod.value = 0;
        blurMaterial.uniforms.uStep.value.set(0, 1.6 / blurA.height);
        renderer.setRenderTarget(blurB);
        renderer.render(passScene, passCamera);

        // 5. Glass panes over the scene, to the screen
        light.x += (light.tx - light.x) * 0.06;
        light.y += (light.ty - light.y) * 0.06;
        cu.uLight.value.set(light.x, light.y).normalize();
        cu.uCount.value = collectPanes();
        cu.uBg.value = bgTarget.texture;
        cu.uBlur.value = blurB.texture;
        cu.uRes.value.set(width * dpr, height * dpr);
        cu.uDpr.value = dpr;

        fullscreen.material = compositeMaterial;
        renderer.setRenderTarget(null);
        renderer.render(passScene, passCamera);

        if (!lost) requestAnimationFrame(frame);
    }

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        lost = true;
        document.documentElement.classList.remove('glass-gl');
        canvas.remove();
    });

    document.documentElement.classList.add('glass-gl');
    requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
