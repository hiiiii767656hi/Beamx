let scene, camera, renderer;
let car, speedEl;
let roadSegments = [];
const segmentLength = 20;
const totalSegments = 25;

let carState = {
    pos: new THREE.Vector3(0, 0, 0),
    speed: 0,
    maxSpeed: 0.9,
    accel: 0.012,
    friction: 0.985,
    steering: 0,
    angle: 0
};

const keys = { up: false, down: false, left: false, right: false };

function init() {
    const container = document.getElementById('canvas-container');
    speedEl = document.getElementById('speed');

    // Sahne & Sis (Slowroads Tarzı Yumuşak Ufuk)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaccff);
    scene.fog = new THREE.FogExp2(0xaaccff, 0.007);

    // Kamera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    // WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Işıklandırma
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(0xfff5ea, 1.2);
    sun.position.set(100, 150, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 500;
    const d = 150;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    scene.add(sun);

    // Zemin / Arazi
    createTerrain();

    // Araç
    createCar();

    // Yol Başlangıcı
    generateInitialRoad();

    // Kontroller
    setupInput();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function createTerrain() {
    const geo = new THREE.PlaneGeometry(1000, 1000, 80, 80);
    const mat = new THREE.MeshStandardMaterial({ color: 0x55aa55, roughness: 0.9 });
    const terrain = new THREE.Mesh(geo, mat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.1;
    terrain.receiveShadow = true;
    scene.add(terrain);
}

function createCar() {
    const carGroup = new THREE.Group();

    // Gövde
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.7, 3.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2277fe, roughness: 0.2, metalness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    carGroup.add(body);

    // Kabin
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.6, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.1, -0.2);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // Tekerlekler
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    wheelGeo.rotateZ(Math.PI / 2);

    const positions = [
        [-0.95, 0.35, 1.1], [0.95, 0.35, 1.1],
        [-0.95, 0.35, -1.1], [0.95, 0.35, -1.1]
    ];

    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        wheel.castShadow = true;
        carGroup.add(wheel);
    });

    scene.add(carGroup);
    car = carGroup;
}

function createRoadSegment(zPos, curveOffset) {
    const segmentGroup = new THREE.Group();

    // Yol Şeridi
    const roadGeo = new THREE.PlaneGeometry(10, segmentLength);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.7 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    segmentGroup.add(road);

    // Yol Kenar Çizgileri
    const lineGeo = new THREE.PlaneGeometry(0.3, segmentLength);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftLine = new THREE.Mesh(lineGeo, lineMat);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-4.5, 0.01, 0);
    segmentGroup.add(leftLine);

    const rightLine = new THREE.Mesh(lineGeo, lineMat);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.position.set(4.5, 0.01, 0);
    segmentGroup.add(rightLine);

    // Ağaçlar (Sonsuz Çevre)
    if (Math.random() > 0.3) {
        createTree(segmentGroup, -8 - Math.random() * 15);
        createTree(segmentGroup, 8 + Math.random() * 15);
    }

    segmentGroup.position.set(curveOffset, 0, zPos);
    scene.add(segmentGroup);

    return { group: segmentGroup, z: zPos, x: curveOffset };
}

function createTree(parent, xPos) {
    const treeGroup = new THREE.Group();
    
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 2),
        new THREE.MeshStandardMaterial({ color: 0x5a3d28 })
    );
    trunk.position.y = 1;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(2, 4, 5),
        new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 })
    );
    leaves.position.y = 3;
    leaves.castShadow = true;
    treeGroup.add(leaves);

    treeGroup.position.set(xPos, 0, (Math.random() - 0.5) * segmentLength);
    parent.add(treeGroup);
}

function generateInitialRoad() {
    let currentZ = 0;
    let currentX = 0;

    for (let i = 0; i < totalSegments; i++) {
        currentZ -= segmentLength;
        currentX += Math.sin(i * 0.3) * 2; // Yumuşak kıvrımlı yol
        const seg = createRoadSegment(currentZ, currentX);
        roadSegments.push(seg);
    }
}

function updateRoad() {
    const lastSeg = roadSegments[roadSegments.length - 1];
    const firstSeg = roadSegments[0];

    // Araç ilerledikçe arkada kalan yolu öne taşı (Prosedürel Sonsuz Yol)
    if (carState.pos.z - lastSeg.z < totalSegments * segmentLength) {
        const newZ = firstSeg.z - segmentLength;
        const newX = firstSeg.x + Math.sin(newZ * 0.02) * 3;
        
        const recycledSeg = roadSegments.pop();
        recycledSeg.group.position.set(newX, 0, newZ);
        recycledSeg.z = newZ;
        recycledSeg.x = newX;
        
        roadSegments.unshift(recycledSeg);
    }
}

function setupInput() {
    window.addEventListener('keydown', e => setKey(e.code, true));
    window.addEventListener('keyup', e => setKey(e.code, false));

    bindTouch('btn-up', 'up');
    bindTouch('btn-down', 'down');
    bindTouch('btn-left', 'left');
    bindTouch('btn-right', 'right');
}

function setKey(code, state) {
    if (code === 'KeyW' || code === 'ArrowUp') keys.up = state;
    if (code === 'KeyS' || code === 'ArrowDown') keys.down = state;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.left = state;
    if (code === 'KeyD' || code === 'ArrowRight') keys.right = state;
}

function bindTouch(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); keys[key] = true; });
    el.addEventListener('touchend', e => { e.preventDefault(); keys[key] = false; });
}

function updatePhysics() {
    // İvmelenme & Fren
    if (keys.up) carState.speed = Math.min(carState.speed + carState.accel, carState.maxSpeed);
    else if (keys.down) carState.speed = Math.max(carState.speed - carState.accel, -carState.maxSpeed * 0.3);
    else carState.speed *= carState.friction;

    // Direksiyon
    if (Math.abs(carState.speed) > 0.001) {
        const dir = carState.speed > 0 ? 1 : -1;
        if (keys.left) carState.angle += 0.025 * dir;
        if (keys.right) carState.angle -= 0.025 * dir;
    }

    // Pozisyon
    carState.pos.x += Math.sin(carState.angle) * carState.speed * 12;
    carState.pos.z -= Math.cos(carState.angle) * carState.speed * 12;

    car.position.copy(carState.pos);
    car.rotation.y = carState.angle;

    updateRoad();

    // Yumuşak Takip Kamerası (Slowroads Hissiyatı)
    const camOffset = new THREE.Vector3(
        Math.sin(carState.angle) * 7,
        3.5,
        -Math.cos(carState.angle) * 7
    );
    const targetCamPos = carState.pos.clone().add(camOffset);
    camera.position.lerp(targetCamPos, 0.08);
    camera.lookAt(carState.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));

    // Gösterge
    speedEl.innerText = Math.round(Math.abs(carState.speed) * 160);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
