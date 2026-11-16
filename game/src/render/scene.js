// The renderer and the camera, and nothing about the game. Tone mapping and a fog colour chosen
// from the palette do most of the look; the camera's field of view is wide enough that the mid
// corridor reads as a corridor and not as a doorway.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

export const FOV = 76;

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(PALETTE.canvas);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 13, 68);

  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.04, 220);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, resize, domElement: renderer.domElement };
}
