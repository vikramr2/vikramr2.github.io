// Animated background.
//
// A three.js scene of wireframe polyhedra sits behind the page, simulated by
// cannon-es as convex rigid bodies. The pointer is an invisible body that
// pushes them around, and bodies close to each other are linked by faint
// lines, so the scene reads as a network whose shape keeps changing. Two
// scenes are available:
//
//   fall   (default)        the shapes drop onto a grid floor and pile up;
//                           each section of the site views the pile from its
//                           own camera angle, and navigating pans between them
//   drift  (?scene=drift)   the shapes float in zero gravity inside the
//                           screen, bouncing off each other and the edges
//
// router.js announces section changes with a 'sectionchange' event on
// window. If this module fails to load, the page simply has a plain background.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const MAX_BODIES = 16;

// Colors are used as-is, without three.js color management
const BACKGROUND = 0x000000;
const HUES = [0xa99bbf]; // one grayish purple for every shape; add more to cycle through them

const SCENE = new URLSearchParams(location.search).get('scene') === 'drift' ? 'drift' : 'fall';
const FALL = SCENE === 'fall';

const FOV = 40;

// Drift scene: the camera looks down -z at a box as wide as the screen
const CAMERA_Z = 16;
const Z_BACK = -3.5;
const Z_FRONT = 2.5;

// Fall scene: a floor at y = 0, and a camera orbiting a point above the pile
const FALL_TARGET = new THREE.Vector3(0, 0.9, 0);
const FALL_ARENA = 6;            // invisible walls keep the pile within this half-width
const POINTER_HEIGHT = 0.55;     // the pointer body rolls along the floor at this height
const CAMERA_MOVE_SECONDS = 1.8;

// One view of the pile per section: angles in degrees, distance in scene
// units, and lower: how far down the screen to frame the pile (as a fraction
// of its height), so it shows below the section's content where there is room
const SECTION_VIEWS = {
    about:      { azimuth: 0,    elevation: 20, distance: 13,   lower: 0.14 },
    research:   { azimuth: -55,  elevation: 32, distance: 12,   lower: 0.06 },
    projects:   { azimuth: 62,   elevation: 12, distance: 12.5, lower: 0.06 },
    experience: { azimuth: 150,  elevation: 40, distance: 12,   lower: 0.2 },
    journal:    { azimuth: -140, elevation: 26, distance: 11,   lower: 0.3 }
};

const LINK_DISTANCE = FALL ? 2.6 : 5.2;

// Drift scene spin, in radians per second. Bodies get extra rotational inertia so
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

// Plain backdrop with a soft glow of each body's color behind it
const BACKDROP_FS = `
    precision highp float;
    #define MAX_BODIES ${MAX_BODIES}
    in vec2 vUv;
    out vec4 outColor;
    uniform float uAspect;
    uniform vec3 uBackground;
    uniform int uGlowCount;
    uniform vec3 uGlow[MAX_BODIES];       // uv x, uv y, radius (in screen heights)
    uniform vec3 uGlowColor[MAX_BODIES];
    void main() {
        vec3 col = uBackground;
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

// Floor grid for the fall scene, fading out away from the pile
const FLOOR_VS = `
    varying vec3 vWorld;
    void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
    }`;

const FLOOR_FS = `
    uniform vec3 uColor;
    varying vec3 vWorld;
    void main() {
        vec2 cell = abs(fract(vWorld.xz - 0.5) - 0.5) / fwidth(vWorld.xz);
        float line = 1.0 - min(min(cell.x, cell.y), 1.0);
        float fade = 1.0 - smoothstep(3.0, 13.0, length(vWorld.xz));
        float a = line * fade * 0.22;
        gl_FragColor = vec4(uColor * a, a);
    }`;

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
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        display: 'block',
        zIndex: '-3',
        pointerEvents: 'none'
    });
    document.body.prepend(canvas);

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (err) {
        canvas.remove();
        return;
    }
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

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
                uBackground: { value: new THREE.Color(BACKGROUND) },
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

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, FALL ? -9.8 : 0, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = FALL;
    const bodyMaterial = new CANNON.Material('body');
    const wallMaterial = new CANNON.Material('wall');
    if (FALL) {
        world.addContactMaterial(new CANNON.ContactMaterial(bodyMaterial, bodyMaterial, { friction: 0.3, restitution: 0.2 }));
        world.addContactMaterial(new CANNON.ContactMaterial(bodyMaterial, wallMaterial, { friction: 0.4, restitution: 0.25 }));
    } else {
        world.addContactMaterial(new CANNON.ContactMaterial(bodyMaterial, bodyMaterial, { friction: 0.05, restitution: 0.85 }));
        world.addContactMaterial(new CANNON.ContactMaterial(bodyMaterial, wallMaterial, { friction: 0.0, restitution: 0.95 }));
    }

    // Invisible walls. Drift: the visible frustum at z = 0 and a shallow depth
    // range. Fall: the floor plus four walls around the arena.
    const wallNormals = FALL
        ? [new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-1, 0, 0), new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -1)]
        : [new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-1, 0, 0), new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, -1, 0), new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -1)];
    const walls = wallNormals.map((normal) => {
        const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMaterial });
        body.addShape(new CANNON.Plane());
        // A plane's normal is +Z in its own frame; turn it to face inwards
        body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
        world.addBody(body);
        return body;
    });

    let halfW = 1, halfH = 1;
    function placeWalls() {
        if (FALL) {
            const [floor, left, right, back, front] = walls;
            floor.position.set(0, 0, 0);
            left.position.set(-FALL_ARENA, 0, 0);
            right.position.set(FALL_ARENA, 0, 0);
            back.position.set(0, 0, -FALL_ARENA);
            front.position.set(0, 0, FALL_ARENA);
            return;
        }
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

    if (FALL) {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(40, 40),
            new THREE.ShaderMaterial({
                vertexShader: FLOOR_VS,
                fragmentShader: FLOOR_FS,
                uniforms: { uColor: { value: new THREE.Color(HUES[0]) } },
                ...premultiplied
            })
        );
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
    }

    // The pointer is a kinematic sphere: on the z = 0 plane when drifting,
    // rolling along the floor when the shapes have fallen
    const pointer = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: bodyMaterial });
    pointer.addShape(new CANNON.Sphere(FALL ? POINTER_HEIGHT : 0.9));
    pointer.position.set(0, 100, 100);
    world.addBody(pointer);
    const pointerTarget = new THREE.Vector3(0, 100, 100);
    let pointerActive = false;

    // ------------------------------------------------ bodies

    const bodies = [];

    function buildBodies() {
        const portrait = window.innerWidth < window.innerHeight;
        const count = portrait ? 8 : 14;
        const sizeScale = portrait && !FALL ? 0.8 : 1;
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
                linearDamping: FALL ? 0.01 : 0.02,
                angularDamping: FALL ? 0.05 : 0.02,
                allowSleep: FALL,
                sleepSpeedLimit: 0.12,
                sleepTimeLimit: 0.5
            });
            body.addShape(new CANNON.ConvexPolyhedron({ vertices: hull.vertices, faces: hull.faces }));
            body.quaternion.setFromEuler(rand() * 6.28, rand() * 6.28, rand() * 6.28);

            if (FALL) {
                // Stacked high above the floor, so they rain in one after another
                body.position.set((rand() * 2 - 1) * 2.2, 3.5 + i * 0.85, (rand() * 2 - 1) * 2.2);
                body.angularVelocity.set((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3);
            } else {
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
                const speed = 0.35 + rand() * 0.5;
                const dir = new CANNON.Vec3(rand() * 2 - 1, rand() * 2 - 1, (rand() * 2 - 1) * 0.3);
                dir.normalize();
                body.velocity.copy(dir.scale(speed));
                body.angularVelocity.set((rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4);
            }
            world.addBody(body);

            bodies.push({ body, group, hue, scale });
        }
    }

    // The hard ceiling applies after every physics substep, so a hit never
    // carries a burst of spin into the next one
    if (!FALL) {
        world.addEventListener('postStep', () => {
            for (const { body } of bodies) {
                const spin = body.angularVelocity.length();
                if (spin > HARD_SPIN) body.angularVelocity.scale(HARD_SPIN / spin, body.angularVelocity);
            }
        });
    }

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

    // ------------------------------------------------ camera

    // Fall scene: the camera orbits the pile, easing to each section's view
    const view = { ...SECTION_VIEWS.about };
    let cameraMove = null;

    function viewSection(section, instant) {
        const next = SECTION_VIEWS[section] || SECTION_VIEWS.about;
        if (instant || reducedMotion.matches) {
            Object.assign(view, next);
            cameraMove = null;
            return;
        }
        // Go the short way around
        let azimuth = next.azimuth;
        while (azimuth - view.azimuth > 180) azimuth -= 360;
        while (azimuth - view.azimuth < -180) azimuth += 360;
        cameraMove = { from: { ...view }, to: { ...next, azimuth }, start: performance.now() };
    }

    let currentSection = location.hash.slice(1).split('/')[0] || 'about';
    viewSection(currentSection, true);
    window.addEventListener('sectionchange', (e) => {
        if (e.detail.section === currentSection) return;
        currentSection = e.detail.section;
        viewSection(currentSection, false);
    });

    const easeInOutCubic = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const parallax = { x: 0, y: 0, tx: 0, ty: 0 };

    function placeCamera(now) {
        if (!FALL) {
            camera.position.set(parallax.x * 0.9, parallax.y * 0.6, CAMERA_Z);
            camera.lookAt(0, 0, 0);
            return;
        }
        if (cameraMove) {
            const k = Math.min(1, (now - cameraMove.start) / (CAMERA_MOVE_SECONDS * 1000));
            const e = easeInOutCubic(k);
            for (const key of ['azimuth', 'elevation', 'distance', 'lower']) {
                view[key] = cameraMove.from[key] + (cameraMove.to[key] - cameraMove.from[key]) * e;
            }
            if (k === 1) cameraMove = null;
        }
        // Narrow screens back the camera off so the pile still fits across
        const fit = camera.aspect < 0.9 ? Math.min(1.7, 0.9 / camera.aspect) : 1;
        const azimuth = THREE.MathUtils.degToRad(view.azimuth + parallax.x * 6);
        const elevation = THREE.MathUtils.degToRad(view.elevation + parallax.y * 4);
        const d = view.distance * fit;
        camera.position.set(
            FALL_TARGET.x + d * Math.cos(elevation) * Math.sin(azimuth),
            FALL_TARGET.y + d * Math.sin(elevation),
            FALL_TARGET.z + d * Math.cos(elevation) * Math.cos(azimuth)
        );
        camera.lookAt(FALL_TARGET);
        camera.setViewOffset(width, height, 0, -view.lower * height, width, height);
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
            const distance = camera.position.distanceTo(body.position);
            glow.uGlow.value.set([projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5, scale * 2.6 / distance], n * 3);
            const c = hueColors[hue];
            glow.uGlowColor.value.set([c.r, c.g, c.b], n * 3);
            n++;
        }
        glow.uGlowCount.value = n;
    }

    // ------------------------------------------------ sizing

    let width = 0, height = 0;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        placeWalls();

        [...lineMaterials, linkMaterial].forEach(m => m.resolution.set(width * dpr, height * dpr));
        pointMaterials.forEach(m => { m.uniforms.uSize.value = 190 * dpr; });
        backdrop.material.uniforms.uAspect.value = width / height;
    }
    resize();
    buildBodies();
    window.addEventListener('resize', resize);

    // Without motion the pile never gets to fall, so settle it up front
    if (FALL && reducedMotion.matches) {
        for (let i = 0; i < 600; i++) world.step(1 / 60);
    }

    // ------------------------------------------------ input

    const unprojected = new THREE.Vector3();

    window.addEventListener('pointermove', (e) => {
        parallax.tx = (e.clientX - width / 2) / width;
        parallax.ty = (height / 2 - e.clientY) / height;

        // Where the pointer ray meets the z = 0 plane (drift) or the plane the
        // pointer body rolls on (fall)
        unprojected.set(e.clientX / width * 2 - 1, -(e.clientY / height) * 2 + 1, 0.5).unproject(camera);
        unprojected.sub(camera.position).normalize();
        const t = FALL
            ? (POINTER_HEIGHT - camera.position.y) / unprojected.y
            : -camera.position.z / unprojected.z;
        pointerTarget.copy(camera.position).addScaledVector(unprojected, t);
        const onFloor = t > 0 && Math.abs(pointerTarget.x) < FALL_ARENA && Math.abs(pointerTarget.z) < FALL_ARENA;
        if (FALL && !onFloor) {
            parkPointer();
            return;
        }
        if (!pointerActive) pointer.position.copy(pointerTarget);
        pointerActive = true;
    }, { passive: true });

    function parkPointer() {
        pointerActive = false;
        pointer.position.set(0, 100, 100);
        pointer.velocity.set(0, 0, 0);
    }
    document.documentElement.addEventListener('pointerleave', parkPointer);
    window.addEventListener('blur', parkPointer);

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
                const toward = (target, current) => THREE.MathUtils.clamp((target - current) / dt, -POINTER_SPEED, POINTER_SPEED);
                pointer.velocity.set(
                    toward(pointerTarget.x, p.x),
                    FALL ? (POINTER_HEIGHT - p.y) / dt : toward(pointerTarget.y, p.y),
                    FALL ? toward(pointerTarget.z, p.z) : -p.z / dt
                );
            }
            world.step(1 / 60, dt, 3);
            if (!FALL) keepDrifting(dt);
        }
        for (const { body, group } of bodies) {
            group.position.copy(body.position);
            group.quaternion.copy(body.quaternion);
        }

        // 2. Camera: the section's view, shifted a little with the pointer for depth
        if (!still) {
            parallax.x += (parallax.tx - parallax.x) * 0.03;
            parallax.y += (parallax.ty - parallax.y) * 0.03;
        }
        placeCamera(now);

        updateLinks();
        updateGlows();

        // 3. Draw
        renderer.render(scene, camera);

        if (!lost) requestAnimationFrame(frame);
    }

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        lost = true;
        canvas.remove();
    });

    requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
