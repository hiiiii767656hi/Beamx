let scene, camera, renderer;
let car, player;
let isInCar = false;
let canEnterCar = false;
const obstacles = [];

const pState = { pos: new THREE.Vector3(5, 1, 5), angle: 0, speed: 0.15 };
const cState = { pos: new THREE.Vector3(0, 0.5, 0), angle: 0, speed: 0, maxSpeed: 1.2, accel: 0.02, friction: 0.97 };
const keys = { up: false, down: false, left: false, right: false, action: false };

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5ca2e8);
    scene.fog = new THREE.FogExp2(0x5ca2e8, 0.003);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Maksimum Grafik Ayarları (PBR & Soft Shadows)
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Işıklandırma
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.8);
    sun.position.set(100, 150, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    const d = 80;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    scene.add(sun);

    buildWorld();
    setupEntities();
    setupInput();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function buildWorld() {
    // Asfalt Zemin
    const floorGeo = new THREE.PlaneGeometry(500, 500);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Çarpışılabilir Binalar/Kutular
    for(let i=0; i<40; i++) {
        const w = 4 + Math.random() * 8;
        const h = 5 + Math.random() * 20;
        const d = 4 + Math.random() * 8;
        const mat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, roughness: 0.3, metalness: 0.6 });
        const building = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        building.scale.set(w, h, d);
        
        let bx = (Math.random() - 0.5) * 300;
        let bz = (Math.random() - 0.5) * 300;
        
        // Araç doğma noktasını temiz bırak
        if(Math.abs(bx) < 15 && Math.abs(bz) < 15) bx += 20;

        building.position.set(bx, h/2, bz);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        
        // Fizik Kutusu Ekle
        obstacles.push(new THREE.Box3().setFromObject(building));
    }
}

function setupEntities() {
    // Oyuncu (Yaya)
    const pGeo = new THREE.CapsuleGeometry(0.4, 1, 4, 8);
    const pMat = new THREE.MeshStandardMaterial({ color: 0x00cec9, roughness: 0.4 });
    player = new THREE.Mesh(pGeo, pMat);
    player.position.copy(pState.pos);
    player.castShadow = true;
    scene.add(player);

    // Araç (PBR Metalik Yansımalı)
    car = new THREE.Group();
    
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd63031, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4.5), bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    car.add(body);
    
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2.2), cabinMat);
    cabin.position.set(0, 1.4, -0.2);
    cabin.castShadow = true;
    car.add(cabin);

    scene.add(car);
    car.position.copy(cState.pos);
}

function setupInput() {
    window.addEventListener('keydown', e => handleKey(e.code, true));
    window.addEventListener('keyup', e => handleKey(e.code, false));

    const binds = { 'btn-up': 'up', 'btn-down': 'down', 'btn-left': 'left', 'btn-right': 'right' };
    for(let id in binds) {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[binds[id]] = true; });
        el.addEventListener('touchend', (e) => { e.preventDefault(); keys[binds[id]] = false; });
    }

    const actionBtn = document.getElementById('btn-action');
    actionBtn.addEventListener('touchstart', e => { e.preventDefault(); toggleCar(); });
    actionBtn.addEventListener('mousedown', e => { e.preventDefault(); toggleCar(); });
}

function handleKey(code, state) {
    if (code === 'KeyW' || code === 'ArrowUp') keys.up = state;
    if (code === 'KeyS' || code === 'ArrowDown') keys.down = state;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.left = state;
    if (code === 'KeyD' || code === 'ArrowRight') keys.right = state;
    if (code === 'KeyF' && state && canEnterCar) toggleCar();
}

function toggleCar() {
    isInCar = !isInCar;
    document.getElementById('mode-text').innerText = isInCar ? "Araç Modu" : "Yaya Modu";
    document.getElementById('speed-display').style.display = isInCar ? "block" : "none";
    document.getElementById('interaction-prompt').style.display = "none";
    document.getElementById('btn-action').style.display = "none";
    
    if (isInCar) {
        player.visible = false;
    } else {
        player.visible = true;
        pState.pos.x = cState.pos.x - Math.cos(cState.angle) * 2.5;
        pState.pos.z = cState.pos.z + Math.sin(cState.angle) * 2.5;
        player.position.copy(pState.pos);
        pState.angle = cState.angle;
    }
    canEnterCar = false;
}

function checkCollisions(targetPos, radius) {
    const sphere = new THREE.Sphere(targetPos, radius);
    for(let obs of obstacles) {
        if (obs.intersectsSphere(sphere)) return true;
    }
    return false;
}

function updateLogic() {
    if (!isInCar) {
        // Yaya Fiziği
        if (keys.up) {
            const nextPos = pState.pos.clone();
            nextPos.x += Math.sin(pState.angle) * pState.speed;
            nextPos.z += Math.cos(pState.angle) * pState.speed;
            if(!checkCollisions(nextPos, 0.4)) pState.pos.copy(nextPos);
        }
        if (keys.down) {
            const nextPos = pState.pos.clone();
            nextPos.x -= Math.sin(pState.angle) * pState.speed;
            nextPos.z -= Math.cos(pState.angle) * pState.speed;
            if(!checkCollisions(nextPos, 0.4)) pState.pos.copy(nextPos);
        }
        if (keys.left) pState.angle += 0.05;
        if (keys.right) pState.angle -= 0.05;

        player.position.copy(pState.pos);
        player.rotation.y = pState.angle;

        camera.position.lerp(new THREE.Vector3(
            pState.pos.x - Math.sin(pState.angle) * 4,
            pState.pos.y + 2,
            pState.pos.z - Math.cos(pState.angle) * 4
        ), 0.15);
        camera.lookAt(pState.pos.x, pState.pos.y + 1, pState.pos.z);

        const dist = pState.pos.distanceTo(cState.pos);
        if (dist < 3.5) {
            canEnterCar = true;
            document.getElementById('interaction-prompt').style.display = "block";
            document.getElementById('btn-action').style.display = "flex";
        } else {
            canEnterCar = false;
            document.getElementById('interaction-prompt').style.display = "none";
            document.getElementById('btn-action').style.display = "none";
        }

    } else {
        // Araç Fiziği
        if (keys.up) cState.speed = Math.min(cState.speed + cState.accel, cState.maxSpeed);
        else if (keys.down) cState.speed = Math.max(cState.speed - cState.accel, -cState.maxSpeed * 0.4);
        else cState.speed *= cState.friction;

        if (Math.abs(cState.speed) > 0.01) {
            const dir = cState.speed > 0 ? 1 : -1;
            if (keys.left) cState.angle += 0.035 * dir;
            if (keys.right) cState.angle -= 0.035 * dir;
        }

        const nextPos = cState.pos.clone();
        nextPos.x += Math.sin(cState.angle) * cState.speed;
        nextPos.z += Math.cos(cState.angle) * cState.speed;

        if(!checkCollisions(nextPos, 2.0)) {
            cState.pos.copy(nextPos);
        } else {
            cState.speed *= -0.4;
        }

        car.position.copy(cState.pos);
        car.rotation.y = cState.angle;

        camera.position.lerp(new THREE.Vector3(
            cState.pos.x - Math.sin(cState.angle) * 9,
            cState.pos.y + 4.5,
            cState.pos.z - Math.cos(cState.angle) * 9
        ), 0.1);
        camera.lookAt(cState.pos.x, cState.pos.y + 1, cState.pos.z);

        document.getElementById('speed').innerText = Math.round(Math.abs(cState.speed) * 140);
        document.getElementById('btn-action').style.display = "flex";
        canEnterCar = true;
    }
}

function animate() {
    requestAnimationFrame(animate);
    updateLogic();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
