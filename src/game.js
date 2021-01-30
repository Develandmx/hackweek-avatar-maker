import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";
import logger from "./logger";
import constants from "./constants";
import assets from "./assets";

const avatarParts = Object.keys(assets);

const state = {
  DOMContentLoaded: false,
  shouldResize: false,
  didInit: false,
  scene: null,
  camera: null,
  renderer: null,
  // TODO: Important to initialize each part to null?
  avatarNodes: {},
  avatarConfig: {},
  newAvatarConfig: {},
  shouldApplyNewAvatarConfig: false,
  shouldExportAvatar: false,
};
window.gameState = state;

window.addEventListener("DOMContentLoaded", () => {
  state.DOMContentLoaded = true;
});
window.onresize = () => {
  state.shouldResize = true;
};
document.addEventListener(constants.avatarConfigChanged, (e) => {
  state.newAvatarConfig = e.detail.avatarConfig;
  state.shouldApplyNewAvatarConfig = true;
});
document.addEventListener(constants.exportAvatar, () => {
  state.shouldExportAvatar = true;
});

const loadGLTF = (function () {
  const loader = new GLTFLoader();
  return function loadGLTF(url) {
    return new Promise(function (resolve, reject) {
      loader.load(
        url,
        function (gltf) {
          resolve(gltf);
          // gltf.animations; // Array<THREE.AnimationClip>
          // gltf.scene; // THREE.Group
          // gltf.scenes; // Array<THREE.Group>
          // gltf.cameras; // Array<THREE.Camera>
          // gltf.asset; // Object
        },
        function (xhr) {
          logger.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        },
        function (error) {
          logger.log("An error happened");
          reject(error);
        }
      );
    });
  };
})();

function init() {
  THREE.Cache.enabled = true;
  const scene = new THREE.Scene();
  state.scene = scene;
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0.25, 1.5);
  state.camera = camera;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 2, 1);
  scene.add(directionalLight);

  const renderer = new THREE.WebGLRenderer();
  state.renderer = renderer;
  renderer.setSize(window.innerWidth, window.innerHeight);
  // TODO: Square this with react
  document.body.appendChild(renderer.domElement);

  state.avatarGroup = new THREE.Group();
  scene.add(state.avatarGroup);
  for (const part of avatarParts) {
    state.avatarNodes[part] = new THREE.Group();
    state.avatarGroup.add(state.avatarNodes[part]);
  }
}

function removeBones(node) {
  const childrenToRemove = [];
  for (const child of node.children) {
    if (child.type === "Bone") {
      childrenToRemove.push(child);
    } else {
      removeBones(child);
    }
  }
  for (const child of childrenToRemove) {
    node.remove(child);
  }
}

function findSkeleton(node) {
  if (node.type === "SkinnedMesh") return node.skeleton;
  for (const child of node.children) {
    const skeleton = findSkeleton(child);
    if (skeleton) return skeleton;
  }
}

function setSkeleton(node, skeleton) {
  node.traverse((child) => {
    if (child.type === "SkinnedMesh") {
      child.skeleton = skeleton;
    }
  });
}

function renameAvatarRoot(node) {
  node.traverse((child) => {
    if (child.name === "AvatarRoot") {
      child.name = "";
    }
  });
}

function exportAvatar() {
  const exporter = new GLTFExporter();
  const avatarGroupClone = state.avatarGroup.clone(true);
  const childWithSkeleton = avatarGroupClone.children.find((child) => !!findSkeleton(avatarGroupClone));
  const skeleton = findSkeleton(childWithSkeleton);
  console.log(childWithSkeleton,  skeleton);
  for (const child of avatarGroupClone.children) {
    if (child === childWithSkeleton) continue;
    removeBones(child);
    setSkeleton(child, skeleton);
    renameAvatarRoot(child);
  }
  const exportBinary = false;
  exporter.parse(
    avatarGroupClone,
    (gltf) => {
      if (exportBinary) {
        const blob = new Blob([gltf], { type: "application/octet-stream" });
        const el = document.createElement("a");
        el.style.display = "none";
        el.href = URL.createObjectURL(blob);
        el.download = "custom_avatar.glb";
        el.click();
        el.remove();
      } else {
        console.log(gltf);
      }
    },
    { binary: exportBinary }
  );
}

function tick(time) {
  {
    window.requestAnimationFrame(tick);
  }

  {
    if (state.DOMContentLoaded && !state.didInit) {
      init();
      state.didInit = true;
    }
    if (!state.didInit) {
      return;
    }
  }

  {
    if (state.shouldResize) {
      state.shouldResize = false;
      state.renderer.setSize(window.innerWidth, window.innerHeight);
      state.camera.aspect = window.innerWidth / window.innerHeight;
      state.camera.updateProjectionMatrix();
    }
  }

  {
    // Render scene
    const { renderer, scene, camera } = state;
    renderer.render(scene, camera);
    // TODO: Do we need to update the camera aspect and call updateProjectionMatrix?
  }

  {
    if (state.shouldApplyNewAvatarConfig) {
      for (const part of avatarParts) {
        if (state.newAvatarConfig[part] !== state.avatarConfig[part]) {
          state.avatarNodes[part].clear();
          if (state.newAvatarConfig[part] !== null) {
            loadGLTF(`assets/${state.newAvatarConfig[part]}.glb`).then((gltf) =>
              // TODO: Multiple of these might be in flight at any given time.
              state.avatarNodes[part].add(gltf.scene)
            );
          }
          state.avatarConfig[part] = state.newAvatarConfig[part];
        }
      }
      state.shouldApplyNewAvatarConfig = false;
    }
  }

  {
    if (state.shouldExportAvatar) {
      exportAvatar();
      state.shouldExportAvatar = false;
    }
  }
}

window.requestAnimationFrame(tick);
