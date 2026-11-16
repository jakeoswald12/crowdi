import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Ad } from "../data/types";

/**
 * An infinite, draggable wall of ads rendered with WebGL.
 * - drag / wheel / touch to pan in any direction, with inertia
 * - lens distortion + chromatic split that grow with velocity
 * - hovering a tile plays that ad inside the tile
 */

export interface WallHover {
  ad: Ad | null;
  x: number;
  y: number;
}

interface Props {
  ads: Ad[];
  onHover: (h: WallHover) => void;
  onOpen: (ad: Ad) => void;
  onDragChange?: (dragging: boolean) => void;
}

const TILE_W = 250;
const TILE_H = 320;
const GAP = 34;
const COLS = 8;
const ROWS = 6;

const tileVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = vec2(uv.x, 1.0 - uv.y); // camera y axis points down
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const tileFrag = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uSize;      // tile size in px
  uniform vec2 uTexSize;   // texture size in px
  uniform float uHover;
  uniform float uReveal;
  uniform float uDim;
  varying vec2 vUv;
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    // object-fit: cover
    float rs = uSize.x / uSize.y;
    float ri = uTexSize.x / max(uTexSize.y, 1.0);
    vec2 scale = rs < ri ? vec2(rs / ri, 1.0) : vec2(1.0, ri / rs);
    vec2 uv = (vUv - 0.5) * scale / (1.0 + uHover * 0.06) + 0.5;
    vec3 col = texture2D(uTex, uv).rgb;
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(grey) * 0.82, col, 0.55 + uHover * 0.45);
    col *= mix(1.0 - uDim * 0.45, 1.0, uHover);
    vec2 p = (vUv - 0.5) * uSize;
    float d = roundBox(p, uSize * 0.5, 18.0);
    float a = 1.0 - smoothstep(-1.0, 0.5, d);
    gl_FragColor = vec4(col, a * uReveal);
  }
`;
const postVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const postFrag = /* glsl */ `
  uniform sampler2D uScene;
  uniform float uStrength;
  uniform float uShift;
  uniform vec2 uRes;
  varying vec2 vUv;
  vec2 barrel(vec2 uv, float k) {
    vec2 c = uv - 0.5;
    c.x *= uRes.x / uRes.y;
    float r2 = dot(c, c);
    c *= 1.0 - k * r2;
    c.x /= uRes.x / uRes.y;
    return c + 0.5;
  }
  void main() {
    vec2 uv = barrel(vUv, uStrength);
    vec2 dir = (vUv - 0.5) * uShift;
    float r = texture2D(uScene, uv + dir).r;
    float g = texture2D(uScene, uv).g;
    float b = texture2D(uScene, uv - dir).b;
    vec3 col = vec3(r, g, b);
    float vig = smoothstep(1.15, 0.25, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
    col *= mix(0.25, 1.0, vig);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function AdWall({ ads, onHover, onOpen, onDragChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onHover, onOpen, onDragChange });
  cbs.current = { onHover, onOpen, onDragChange };

  useEffect(() => {
    const el = host.current;
    if (!el || !ads.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      el.dataset.fallback = "1";
      return;
    }
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x0a0a0a, 1);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
    const post = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: postVert,
        fragmentShader: postFrag,
        uniforms: { uScene: { value: target.texture }, uStrength: { value: 0.18 }, uShift: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
        depthTest: false,
      }),
    );
    const postScene = new THREE.Scene();
    postScene.add(post);
    const postCam = new THREE.Camera();

    // textures
    const loader = new THREE.TextureLoader();
    const texCache = new Map<string, THREE.Texture>();
    const getTex = (url: string) => {
      let t = texCache.get(url);
      if (!t) {
        t = loader.load(url, (tex) => {
          tex.userData.size = new THREE.Vector2((tex.image as HTMLImageElement).width, (tex.image as HTMLImageElement).height);
        });
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        texCache.set(url, t);
      }
      return t;
    };

    // shuffle deterministically so neighbours differ
    const order = ads.map((a, i) => ({ a, k: (i * 7919) % 101 })).sort((x, y) => x.k - y.k).map((x) => x.a);

    const geo = new THREE.PlaneGeometry(1, 1);
    const cellW = TILE_W + GAP;
    const cellH = TILE_H + GAP;
    const totalW = COLS * cellW;
    const totalH = ROWS * cellH;
    type Tile = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; ad: Ad; bx: number; by: number; hover: number; delay: number; col: number };
    const tiles: Tile[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ad = order[(r * COLS + c + r * 3) % order.length];
        const tex = getTex(ad.wall);
        const mat = new THREE.ShaderMaterial({
          vertexShader: tileVert,
          fragmentShader: tileFrag,
          transparent: true,
          side: THREE.DoubleSide,
          uniforms: {
            uTex: { value: tex },
            uSize: { value: new THREE.Vector2(TILE_W, TILE_H) },
            uTexSize: { value: new THREE.Vector2(720, 1280) },
            uHover: { value: 0 },
            uReveal: { value: 0 },
            uDim: { value: 0 },
          },
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(TILE_W, TILE_H, 1);
        scene.add(mesh);
        // stagger columns vertically for a more organic wall
        const by = r * cellH + (c % 2 ? cellH * 0.42 : 0);
        tiles.push({ mesh, mat, ad, bx: c * cellW, by, hover: 0, delay: 0, col: c });
      }
    }

    // shared video for the hovered tile
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    const vtex = new THREE.VideoTexture(video);
    vtex.colorSpace = THREE.SRGBColorSpace;
    let videoAd: Ad | null = null;
    let videoReady = false;
    video.addEventListener("playing", () => (videoReady = true));

    let W = 1, H = 1;
    const resize = () => {
      W = el.clientWidth;
      H = el.clientHeight;
      renderer.setSize(W, H);
      target.setSize(W * dpr, H * dpr);
      camera.left = 0;
      camera.right = W;
      camera.top = 0;
      camera.bottom = H;
      camera.updateProjectionMatrix();
      (post.material as THREE.ShaderMaterial).uniforms.uRes.value.set(W, H);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // input
    const pos = { x: -totalW / 2 + 140, y: -totalH / 2 + 80 };
    const vel = { x: 0, y: 0 };
    const drift = reduced ? { x: 0, y: 0 } : { x: -0.22, y: -0.12 };
    let dragging = false;
    let moved = 0;
    let last = { x: 0, y: 0 };
    const mouse = { x: -9999, y: -9999, inside: false };
    let hovered: Tile | null = null;

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== renderer.domElement) return;
      dragging = true;
      moved = 0;
      last = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
      cbs.current.onDragChange?.(true);
    };
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= W && mouse.y <= H;
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      pos.x += dx;
      pos.y += dy;
      vel.x = dx;
      vel.y = dy;
      last = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      cbs.current.onDragChange?.(false);
      if (moved < 6 && hovered) cbs.current.onOpen(hovered.ad);
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const leave = () => {
      mouse.inside = false;
    };
    const wheel = (e: WheelEvent) => {
      // horizontal-ish wheel pans the wall; vertical wheel is left to page scroll unless shift is held
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        vel.x -= (e.shiftKey ? e.deltaY : e.deltaX) * 0.25;
      }
    };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.cursor = "grab";

    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const start = performance.now();
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = (performance.now() - start) / 1000;
      if (!dragging) {
        vel.x *= 0.93;
        vel.y *= 0.93;
        pos.x += vel.x + drift.x;
        pos.y += vel.y + drift.y;
      }
      const speed = Math.min(1, Math.hypot(vel.x, vel.y) / 40);
      const pu = (post.material as THREE.ShaderMaterial).uniforms;
      pu.uStrength.value += (0.16 + speed * 0.32 - pu.uStrength.value) * 0.1;
      pu.uShift.value += (speed * 0.012 - pu.uShift.value) * 0.12;

      let newHover: Tile | null = null;
      const cx = W / 2, cy = H / 2;
      for (const tile of tiles) {
        const x = mod(tile.bx + pos.x, totalW) - cellW;
        const y = mod(tile.by + pos.y, totalH) - cellH;
        tile.mesh.position.set(x + TILE_W / 2, y + TILE_H / 2, 0);
        if (tile.delay === 0) tile.delay = 0.15 + Math.hypot(x + TILE_W / 2 - cx, y + TILE_H / 2 - cy) / 1400;
        const reveal = reduced ? 1 : Math.min(1, Math.max(0, (t - tile.delay) / 0.9));
        const eased = 1 - Math.pow(1 - reveal, 4);
        tile.mat.uniforms.uReveal.value = eased;
        const s = 0.6 + 0.4 * eased;
        if (mouse.inside && !dragging && mouse.x > x && mouse.x < x + TILE_W && mouse.y > y && mouse.y < y + TILE_H) newHover = tile;
        tile.hover += ((tile === hovered ? 1 : 0) - tile.hover) * 0.12;
        tile.mat.uniforms.uHover.value = tile.hover;
        tile.mat.uniforms.uDim.value += ((hovered ? 1 : 0) - tile.mat.uniforms.uDim.value) * 0.08;
        tile.mesh.scale.set(TILE_W * s * (1 + tile.hover * 0.04), TILE_H * s * (1 + tile.hover * 0.04), 1);
        const tex = tile.mat.uniforms.uTex.value as THREE.Texture;
        if (tex.userData.size) tile.mat.uniforms.uTexSize.value.copy(tex.userData.size);
      }

      if (newHover !== hovered) {
        if (hovered) {
          hovered.mat.uniforms.uTex.value = getTex(hovered.ad.wall);
        }
        hovered = newHover;
        renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
        if (hovered && hovered.ad !== videoAd) {
          videoAd = hovered.ad;
          videoReady = false;
          video.src = hovered.ad.video;
          video.currentTime = hovered.ad.aspect === "16:9" ? 6 : 0;
          video.play().catch(() => {});
        }
      }
      if (hovered && videoReady && videoAd === hovered.ad) {
        hovered.mat.uniforms.uTex.value = vtex;
        hovered.mat.uniforms.uTexSize.value.set(video.videoWidth || 720, video.videoHeight || 1280);
      }
      cbs.current.onHover({ ad: hovered?.ad ?? null, x: mouse.x, y: mouse.y });

      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      video.pause();
      video.removeAttribute("src");
      tiles.forEach((t) => t.mat.dispose());
      texCache.forEach((t) => t.dispose());
      vtex.dispose();
      geo.dispose();
      target.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [ads]);

  return <div ref={host} className="absolute inset-0 overflow-hidden" />;
}
