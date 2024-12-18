import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.159.0/three.module.min.js';

let scene, camera, renderer, d20;
let isRolling = false;
let time = 0;
let currentAnimation = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotationSpeed = { x: 0, y: 0 };
let lastResult = 0;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Adjust camera FOV for better size control
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Initial camera position
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('dice-canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const frontLight = new THREE.DirectionalLight(0xffffff, 1.5);
    frontLight.position.set(2, 4, 6);
    scene.add(frontLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 1.5);
    topLight.position.set(-4, 8, -2);
    scene.add(topLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    createD20();

    const container = document.getElementById('container');
    container.addEventListener('click', rollDice);
    container.addEventListener('touchend', (e) => {
        e.preventDefault();
        rollDice();
    });

    // Add mouse/touch event listeners for drag rotation
    container.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    
    // Touch events
    container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrag(e.touches[0]);
    });
    window.addEventListener('touchmove', (e) => {
        e.preventDefault();
        onDrag(e.touches[0]);
    });
    window.addEventListener('touchend', (e) => {
        e.preventDefault();
        endDrag();
    });
}

function createD20() {
    // Create a slightly beveled d20
    const radius = 1;
    const bevel = 0.03; // Adjust this value for more/less rounding (0.01 to 0.05 range)
    
    const geometry = new THREE.IcosahedronGeometry(radius, 0);
    const positions = geometry.attributes.position;
    
    // Create beveled vertices
    for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
        );
        
        // Normalize and adjust for bevel
        vertex.normalize();
        vertex.multiplyScalar(radius - bevel);
        
        // Update position
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    const smokyTexture = createSmokyTexture();
    
    const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        flatShading: false,
        shininess: 80,
        specular: 0x999999,
        transparent: true,
        opacity: 0.9,
        refractionRatio: 0.98,
        envMap: createEnvMap(),
        map: smokyTexture,
    });

    d20 = new THREE.Mesh(geometry, material);
    
    // Create black wireframe for the whole die
    const blackWireframe = createWireframe(radius * 0.97, 0x000000, 1);
    d20.add(blackWireframe);
    
    // Store face highlights
    d20.faceHighlights = [];

    // Store face centers and their corresponding numbers
    d20.faceNumbers = [];
    const faces = positions.count / 3;
    
    for (let i = 0; i < faces; i++) {
        // Get vertices for this face
        const faceVertices = [];
        for (let v = 0; v < 3; v++) {
            const idx = i * 3 + v;
            faceVertices.push(
                positions.getX(idx),
                positions.getY(idx),
                positions.getZ(idx)
            );
        }
        
        // Calculate face center
        const faceCenter = new THREE.Vector3(0, 0, 0);
        for (let v = 0; v < 9; v += 3) {
            faceCenter.add(new THREE.Vector3(
                faceVertices[v],
                faceVertices[v + 1],
                faceVertices[v + 2]
            ));
        }
        faceCenter.divideScalar(3);

        // Create number sprite
        const number = i + 1;
        const numberMesh = createTextSprite(number.toString());
        
        // Calculate face normal
        const v1 = new THREE.Vector3(faceVertices[0], faceVertices[1], faceVertices[2]);
        const v2 = new THREE.Vector3(faceVertices[3], faceVertices[4], faceVertices[5]);
        const v3 = new THREE.Vector3(faceVertices[6], faceVertices[7], faceVertices[8]);
        const normal = new THREE.Vector3()
            .crossVectors(
                new THREE.Vector3().subVectors(v2, v1),
                new THREE.Vector3().subVectors(v3, v1)
            )
            .normalize();

        // When positioning the number, offset it slightly along the face normal
        const offsetDistance = 0.02; // Tiny offset from the face
        numberMesh.position.copy(faceCenter);
        // Add a small offset in the direction of the face normal
        numberMesh.position.add(normal.multiplyScalar(offsetDistance));
        
        // Orient number to align with face
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.lookAt(
            new THREE.Vector3(0, 0, 0),
            normal,
            new THREE.Vector3(0, 1, 0)
        );
        numberMesh.setRotationFromMatrix(rotationMatrix);
        numberMesh.rotateY(Math.PI);
        
        // Scale the number to fit the face
        const scale = 0.25; // Adjust this value to fit your preference
        numberMesh.scale.set(scale, scale, scale);
        
        d20.add(numberMesh);
        
        // Create and store face highlight using actual face vertices
        const highlight = createFaceHighlight(radius, faceVertices);
        highlight.visible = false;
        d20.add(highlight);
        d20.faceHighlights[i] = highlight;
        
        // Store face data
        d20.faceNumbers.push({
            number: number,
            normal: normal.clone(),
            center: faceCenter.clone()
        });
    }

    scene.add(d20);
}

function createTextSprite(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 64;
    canvas.height = 64;

    // Background - transparent
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Text - monospace and white, no stroke
    context.font = 'Bold 32px Courier New';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Fill with white, no stroke
    context.fillStyle = 'white';
    context.fillText(text, canvas.width/2, canvas.height/2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    
    return mesh;
}

function createFaceHighlight(radius, faceVertices) {
    // Create a group to hold multiple lines
    const group = new THREE.Group();
    
    // Create multiple lines with increasing size for thickness
    const offsets = [1.000, 1.002, 1.004, 1.006]; // More offsets for thicker line
    
    offsets.forEach(offset => {
        const lineGeometry = new THREE.BufferGeometry();
        const offsetVertices = faceVertices.map(v => v * offset);
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(offsetVertices, 3));
        
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x22ff44,
            transparent: true,
            opacity: 0
        });
        
        const line = new THREE.LineLoop(lineGeometry, lineMaterial);
        group.add(line);
    });
    
    // Store materials for animation
    group.materials = group.children.map(line => line.material);
    
    return group;
}

function rollDice() {
    // Cancel any existing animation
    if (currentAnimation) {
        cancelAnimationFrame(currentAnimation);
    }
    
    isRolling = true;
    const result = Math.floor(Math.random() * 20) + 1;
    
    // Hide all highlights
    d20.faceHighlights.forEach(highlight => {
        highlight.visible = false;
        highlight.materials.forEach(material => {
            material.opacity = 0;
        });
    });
    
    // Find the face that matches our result
    const targetFace = d20.faceNumbers.find(face => face.number === result);
    
    // Calculate the target orientation
    const targetQuaternion = new THREE.Quaternion();
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    cameraPosition.normalize();
    
    // If same number, add a full rotation to make it more interesting
    if (result === lastResult) {
        const extraRotation = new THREE.Quaternion();
        extraRotation.setFromAxisAngle(new THREE.Vector3(1, 1, 1).normalize(), Math.PI * 2);
        targetQuaternion.multiply(extraRotation);
    }
    
    // Store this result for next time
    lastResult = result;
    
    // Create a rotation that aligns the face normal with the camera direction
    const rotationAxis = new THREE.Vector3();
    rotationAxis.crossVectors(targetFace.normal, cameraPosition).normalize();
    const rotationAngle = Math.acos(targetFace.normal.dot(cameraPosition));
    targetQuaternion.setFromAxisAngle(rotationAxis, rotationAngle);
    
    // More controlled initial velocities
    const baseVelocity = 0.3;  // Reduced from 0.5
    let velocityX = (Math.random() - 0.5) * baseVelocity;
    let velocityY = (Math.random() - 0.5) * baseVelocity;
    let velocityZ = (Math.random() - 0.5) * baseVelocity;
    
    // Normalize the velocities to ensure consistent energy
    const totalVelocity = Math.sqrt(velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ);
    velocityX = (velocityX / totalVelocity) * baseVelocity;
    velocityY = (velocityY / totalVelocity) * baseVelocity;
    velocityZ = (velocityZ / totalVelocity) * baseVelocity;
    
    // Increase initial energy for more rotations
    const initialEnergy = 4;  // Increased from 3 for more consistent rotations
    velocityX *= initialEnergy;
    velocityY *= initialEnergy;
    velocityZ *= initialEnergy;
    
    // Track total rotation
    let totalRotation = 0;
    const minimumRotations = Math.PI * 6;  // Increased from 4 to 6 for smoother transition
    
    let progress = 0;
    const animate = () => {
        progress += 0.004;
        
        if (progress < 1) {
            // Smoother friction curve
            const friction = progress < 0.4 ? 1 : Math.pow(0.975, progress * 80);
            
            // Update rotation based on velocity
            const rotationThisFrame = (velocityX + velocityY + velocityZ) * friction;
            totalRotation += Math.abs(rotationThisFrame);
            
            d20.rotation.x += velocityX * friction;
            d20.rotation.y += velocityY * friction;
            d20.rotation.z += velocityZ * friction;
            
            // Smoother alignment transition
            if (totalRotation > minimumRotations) {
                const alignmentStrength = Math.pow(progress, 3); // Changed from squared to cubic
                d20.quaternion.slerp(targetQuaternion, alignmentStrength * 0.05); // Reduced from 0.1
            }
            
            // Reduce velocity more slowly
            velocityX *= 0.985;
            velocityY *= 0.985;
            velocityZ *= 0.985;
            
            currentAnimation = requestAnimationFrame(animate);
        } else {
            // Smoothly settle into final position
            const settleAnimation = () => {
                const currentDiff = d20.quaternion.angleTo(targetQuaternion);
                if (currentDiff > 0.001) {
                    d20.quaternion.slerp(targetQuaternion, 0.1);
                    currentAnimation = requestAnimationFrame(settleAnimation);
                } else {
                    // Final alignment and highlight
                    d20.quaternion.copy(targetQuaternion);
                    const highlightIndex = result - 1;
                    const highlight = d20.faceHighlights[highlightIndex];
                    highlight.visible = true;
                    
                    let glowProgress = 0;
                    const glowAnimation = () => {
                        glowProgress += 0.03;
                        if (glowProgress <= 1) {
                            highlight.materials.forEach(material => {
                                material.opacity = glowProgress;
                            });
                            requestAnimationFrame(glowAnimation);
                        }
                    };
                    
                    glowAnimation();
                    currentAnimation = null;
                    isRolling = false;
                    document.getElementById('result').textContent = `Rolled ${result}`;
                }
            };
            settleAnimation();
        }
    };
    
    currentAnimation = requestAnimationFrame(animate);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Add smooth rotation decay when not dragging
    if (!isDragging && !isRolling) {
        rotationSpeed.x *= 0.95;
        rotationSpeed.y *= 0.95;
        
        d20.rotation.x += rotationSpeed.x;
        d20.rotation.y += rotationSpeed.y;
    }
    
    // Update time and texture
    time += 0.02; // Changed from 0.05 to 0.02 for slower animation
    if (d20 && d20.material.map) {
        updateSmokyTexture(d20.material.map, time);
    }
    
    renderer.render(scene, camera);
}

// Handle window resize
function updateSize() {
    const container = document.getElementById('container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
    
    // Fixed camera distance for consistent die size
    const cameraDistance = 4;
    camera.position.set(cameraDistance, cameraDistance, cameraDistance);
    camera.lookAt(0, 0, 0);
}

window.addEventListener('resize', updateSize);
// Call once to set initial size
updateSize();

// Add this function to create an environment map
function createEnvMap() {
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128);
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
    scene.add(cubeCamera);
    
    // Create a simple environment map
    const envTexture = new THREE.CubeTextureLoader().load([
        createGradientImage(),
        createGradientImage(),
        createGradientImage(),
        createGradientImage(),
        createGradientImage(),
        createGradientImage()
    ]);
    
    return envTexture;
}

function createGradientImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    const gradient = context.createRadialGradient(
        64, 64, 0,
        64, 64, 64
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#666666');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    
    return canvas.toDataURL();
}

function createSmokyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    // Store context with texture for updates
    texture.context = context;
    
    return texture;
}

function updateSmokyTexture(texture, time) {
    const context = texture.context;
    const width = context.canvas.width;
    const height = context.canvas.height;

    // Create noise pattern
    const imageData = context.createImageData(width, height);
    const data = imageData.data;

    // Create Perlin-like noise with dithering
    for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);
        
        // Multiple layers of noise at different frequencies
        const noise = (
            Math.sin((x + time * 2)/20) * 0.3 +
            Math.sin((y - time * 1.5)/25) * 0.3 +
            Math.sin((x + y + time * 3)/40) * 0.4 +
            // Add some high-frequency noise for dithering
            (Math.random() - 0.5) * 0.3 +
            // Add some circular patterns
            Math.sin(Math.sqrt(
                Math.pow(x - width/2 + Math.sin(time) * 100, 2) + 
                Math.pow(y - height/2 + Math.cos(time) * 100, 2)
            )/50) * 0.4
        );
        
        // Apply dithering pattern
        const dither = ((x % 4) / 4 + (y % 4) / 4) * 0.1;
        
        // Combine noise with dither
        const intensity = Math.max(0, Math.min(1, (noise + dither) * 0.7 + 0.3));
        
        // Green smoke color with slight variation
        data[i] = 34 * intensity;     // R
        data[i + 1] = 255 * intensity + (Math.random() * 20); // G (with sparkle)
        data[i + 2] = 68 * intensity;  // B
        data[i + 3] = 255;            // A
    }

    context.putImageData(imageData, 0, 0);

    // Add softer swirls
    context.globalCompositeOperation = 'overlay';
    const gradient = context.createRadialGradient(
        width/2 + Math.sin(time * 0.5) * 150,
        height/2 + Math.cos(time * 0.7) * 150,
        0,
        width/2,
        height/2,
        width * 0.9
    );
    
    // Softer color transitions
    gradient.addColorStop(0, 'rgba(34, 255, 68, 0.4)');
    gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(0.7, 'rgba(34, 255, 68, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    texture.needsUpdate = true;
}

// Helper function to create wireframes
function createWireframe(radius, color, opacity) {
    const group = new THREE.Group();
    
    // Create more offset lines for thicker appearance (roughly 6px)
    const offsets = [-0.003, -0.002, -0.001, 0, 0.001, 0.002, 0.003];
    
    offsets.forEach(offset => {
        const wireframeGeometry = new THREE.IcosahedronGeometry(radius + offset, 0);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity * 0.7 // Slightly reduce individual line opacity for better blending
        });
        
        const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(wireframeGeometry),
            wireframeMaterial
        );
        group.add(wireframe);
    });
    
    return group;
}

function startDrag(event) {
    isDragging = true;
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
}

function onDrag(event) {
    if (!isDragging || isRolling) return;

    const deltaMove = {
        x: event.clientX - previousMousePosition.x,
        y: event.clientY - previousMousePosition.y
    };

    // Update rotation speed based on drag movement
    rotationSpeed.x = deltaMove.y * 0.005;
    rotationSpeed.y = deltaMove.x * 0.005;

    // Apply rotation
    d20.rotation.x += rotationSpeed.x;
    d20.rotation.y += rotationSpeed.y;

    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
}

function endDrag() {
    if (!isDragging) return;
    isDragging = false;

    // Only trigger roll if we have significant rotation speed
    const totalSpeed = Math.abs(rotationSpeed.x) + Math.abs(rotationSpeed.y);
    if (totalSpeed > 0.01) {
        rollDice();
    }
} 