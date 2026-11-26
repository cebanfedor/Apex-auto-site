/* 3D-карта повреждений (26.11.2026): процедурная модель автомобиля на Three.js (r149, /vendor/three/three.min.js, грузится лениво).
   Повреждённые зоны красятся ПРЯМО НА КУЗОВЕ в шейдере (по положению точки в системе координат машины), поэтому подсветка плавно
   перетекает между панелями. Вращение — мышью/пальцем, кнопки видов «Перед / Бок / Зад / Сверху», подпись у основного удара.
   Разметку (.dmg3dStageV1) рисует auctions.js (damageMapHtml): data-zones='{"FR":2,"F":1}', data-main="FR", data-names='{"FR":"Справа спереди",…}'.
   Нет WebGL / three не загрузился — остаётся 2D-схема из разметки (fallback). Зоны: F FL FR L R T RL B RR. Перед машины — по -Z, правый борт — +X. */
(function(){
  "use strict";
  var THREE_SRC = "/vendor/three/three.min.js?v=r149";
  var threeP = null;
  function loadThree(){
    if(window.THREE) return Promise.resolve(window.THREE);
    if(threeP) return threeP;
    threeP = new Promise(function(res, rej){
      var s = document.createElement("script");
      s.src = THREE_SRC; s.async = true;
      s.onload = function(){ window.THREE ? res(window.THREE) : rej(new Error("no THREE")); };
      s.onerror = function(){ rej(new Error("three load failed")); };
      document.head.appendChild(s);
    });
    return threeP;
  }

  var ZONE_IDX = {F:0, FL:1, FR:2, L:3, R:4, T:5, RL:6, B:7, RR:8};
  // центр зоны на кузове и внешняя нормаль (для подписи и «видимости» метки)
  var ZONE_POS = {
    F:[0, 0.66, -2.2, 0, 0, -1], FL:[-0.62, 0.7, -2.05, -0.5, 0, -0.85], FR:[0.62, 0.7, -2.05, 0.5, 0, -0.85],
    L:[-0.93, 0.78, 0.05, -1, 0, 0], R:[0.93, 0.78, 0.05, 1, 0, 0], T:[0, 1.52, 0.35, 0, 1, 0],
    RL:[-0.62, 0.75, 2.0, -0.5, 0, 0.85], B:[0, 0.8, 2.2, 0, 0, 1], RR:[0.62, 0.75, 2.0, 0.5, 0, 0.85]
  };
  // азимут камеры (радианы): позиция = (sin az, ., cos az); перед машины — -Z, значит «спереди» az=π
  var ZONE_AZ = {F:Math.PI, FL:-2.35, FR:2.35, L:-Math.PI / 2, R:Math.PI / 2, T:0.6, RL:-0.85, B:0, RR:0.85};
  var VIEWS = {front:[Math.PI, 0.16], left:[-Math.PI / 2, 0.14], rear:[0, 0.16], right:[Math.PI / 2, 0.14], top:[0.0, 1.5]};

  // ---------------- геометрия кузова (лофт по длине) ----------------
  var HL = 2.25, HW = 0.92;
  var TOP_PTS = [[-2.25, 0.74], [-2.1, 0.84], [-1.6, 0.93], [-0.9, 1.0], [-0.15, 1.5], [0.2, 1.54], [0.85, 1.5], [1.55, 1.1], [2.0, 1.0], [2.25, 0.86]];
  function smoothstep(a, b, x){ var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function catmull(pts, z){
    var n = pts.length;
    if(z <= pts[0][0]) return pts[0][1];
    if(z >= pts[n - 1][0]) return pts[n - 1][1];
    var i = 0; while(i < n - 2 && z > pts[i + 1][0]) i++;
    var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    var t = (z - p1[0]) / (p2[0] - p1[0]);
    var m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]);
    var m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]);
    var t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  }
  function yBottom(z){ return 0.3 + 0.1 * smoothstep(1.6, 2.25, Math.abs(z)); }
  function planWidth(z){ var q = Math.pow(Math.abs(z) / HL, 3.4); return Math.pow(Math.max(0, 1 - q), 1 / 3.4); }
  var N_SEC = 3.4;
  function sec(z, th){
    var top = catmull(TOP_PTS, z), yb = yBottom(z), yc = (top + yb) / 2, b = (top - yb) / 2;
    var a = HW * planWidth(z);
    var c = Math.cos(th), s = Math.sin(th);
    var cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / N_SEC), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / N_SEC);
    var y = yc + b * sy;
    var yn = (y - yb) / (top - yb);
    var tw = Math.min(1, Math.max(0, (top - 0.98) / 0.5));
    var x = a * cx * (1 - 0.3 * tw * Math.pow(smoothstep(0.5, 1.0, yn), 1.25));
    return [x, y];
  }
  function buildBodyGeometry(THREE){
    var NZ = 110, NT = 72, pos = new Float32Array(NZ * NT * 3), idx = [];
    for(var i = 0; i < NZ; i++){
      var t = i / (NZ - 1), z = -HL * Math.cos(Math.PI * t);
      for(var j = 0; j < NT; j++){
        var th = j / NT * Math.PI * 2, p = sec(z, th), k = (i * NT + j) * 3;
        pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = z;
      }
    }
    for(var i2 = 0; i2 < NZ - 1; i2++) for(var j2 = 0; j2 < NT; j2++){
      var a = i2 * NT + j2, b = i2 * NT + (j2 + 1) % NT, c = (i2 + 1) * NT + j2, d = (i2 + 1) * NT + (j2 + 1) % NT;
      idx.push(a, b, c, b, d, c);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function sideX(z, y){   // x поверхности ПРАВОГО борта на высоте y (учитывает завал борта): бисекция по углу сечения
    var lo = -Math.PI / 2, hi = Math.PI / 2;
    for(var i = 0; i < 40; i++){ var mid = (lo + hi) / 2; if(sec(z, mid)[1] < y) lo = mid; else hi = mid; }
    return Math.max(0, sec(z, (lo + hi) / 2)[0]);
  }

  // ---------------- шейдер кузова ----------------
  var WHEELS = [[-1.38, 0.4], [1.38, 0.4]];   // [z, y центра колеса]
  var ARCH_R = 0.47;
  function makeBodyMaterial(THREE, zoneArr){
    var mat = new THREE.MeshPhysicalMaterial({color:0xc7ced9, metalness:0.5, roughness:0.3, clearcoat:1, clearcoatRoughness:0.1, side:THREE.DoubleSide, envMapIntensity:0.75});
    var uni = {uZ:{value:zoneArr}, uTime:{value:0}, uAmber:{value:new THREE.Color(0xf2a31b)}, uRed:{value:new THREE.Color(0xe5162b)}};
    mat.userData.uni = uni;
    mat.onBeforeCompile = function(sh){
      sh.uniforms.uZ = uni.uZ; sh.uniforms.uTime = uni.uTime; sh.uniforms.uAmber = uni.uAmber; sh.uniforms.uRed = uni.uRed;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLPos; varying vec3 vLNor;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLPos = position; vLNor = normal;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLPos; varying vec3 vLNor;\nuniform float uZ[9]; uniform float uTime; uniform vec3 uAmber; uniform vec3 uRed;\n" +
          "float zoneLevel(vec3 p){\n" +
          "  float pw = pow(max(0.02, 1.0 - pow(abs(p.z) / 2.25, 3.4)), 1.0 / 3.4); float u = p.x / (0.92 * pw);\n" +
          "  float sl = 1.0 - smoothstep(-0.56, -0.34, u); float sr = smoothstep(0.34, 0.56, u); float sc = max(0.0, 1.0 - sl - sr);\n" +
          "  float sf = 1.0 - smoothstep(-1.1, -0.78, p.z); float sb = smoothstep(0.85, 1.15, p.z); float sm = max(0.0, 1.0 - sf - sb);\n" +
          "  return sf * (sl * uZ[1] + sc * uZ[0] + sr * uZ[2]) + sm * (sl * uZ[3] + sc * uZ[5] + sr * uZ[4]) + sb * (sl * uZ[6] + sc * uZ[7] + sr * uZ[8]);\n" +
          "}\n" +
          "float lineAt(float v, float c, float w){ return 1.0 - smoothstep(w * 0.4, w, abs(v - c)); }\n")
        .replace("#include <color_fragment>", "#include <color_fragment>\n" +
          "  vec3 lp = vLPos; vec3 ln = normalize(vLNor);\n" +
          "  float side = smoothstep(0.45, 0.8, abs(ln.x)); float upN = smoothstep(0.25, 0.7, ln.y);\n" +
          "  float frontN = smoothstep(0.35, 0.75, -ln.z); float rearN = smoothstep(0.35, 0.75, ln.z);\n" +
          // колёсные арки: дыра в борту (видно колесо), тёмный «подкрылок» — задняя грань
          "  float archD = 1.0; for(int i = 0; i < 2; i++){ float wz = (i == 0) ? -1.38 : 1.38; archD = min(archD, length(vec2(lp.z - wz, lp.y - 0.4))); }\n" +
          "  float archMask = side * (1.0 - smoothstep(0.455, 0.475, archD)) * step(lp.y, 0.9);\n" +
          "  if(archMask > 0.5) discard;\n" +
          "  float level = zoneLevel(lp);\n" +
          "  float amb = smoothstep(0.1, 0.6, level); float red = smoothstep(0.95, 1.5, level);\n" +
          "  vec3 dmgCol = mix(uAmber, uRed, red);\n" +
          // стекла
          "  float glassSide = side * smoothstep(0.9, 0.925, lp.y) * smoothstep(-0.64, -0.6, lp.z) * (1.0 - smoothstep(1.44, 1.48, lp.z)) * (1.0 - lineAt(lp.z, 0.5, 0.045));\n" +
          "  float glassFront = smoothstep(-0.84, -0.8, lp.z) * (1.0 - smoothstep(-0.2, -0.15, lp.z)) * smoothstep(1.04, 1.07, lp.y) * (1.0 - smoothstep(0.58, 0.64, abs(lp.x))) * smoothstep(0.35, 0.55, ln.y);\n" +
          "  float glassRear = smoothstep(0.86, 0.9, lp.z) * (1.0 - smoothstep(1.5, 1.55, lp.z)) * smoothstep(1.02, 1.05, lp.y) * (1.0 - smoothstep(0.54, 0.6, abs(lp.x))) * smoothstep(0.3, 0.5, ln.y) * (1.0 - smoothstep(0.985, 0.998, ln.y));\n" +
          "  float glass = clamp(glassSide + glassFront + glassRear, 0.0, 1.0);\n" +
          "  diffuseColor.rgb = mix(diffuseColor.rgb, dmgCol, amb * 0.93 * (1.0 - glass * 0.6));\n" +
          // швы панелей
          "  float seam = 0.0;\n" +
          "  seam += side * (lineAt(lp.z, -0.62, 0.012) + lineAt(lp.z, 0.5, 0.012) + lineAt(lp.z, 1.32, 0.012)) * step(0.5, lp.y) * (1.0 - step(1.0, lp.y) * 0.0);\n" +
          "  seam += upN * (lineAt(lp.z, -0.95, 0.012) + lineAt(lp.z, 1.56, 0.012)) * step(abs(lp.x), 0.8);\n" +
          "  seam += (frontN + rearN) * lineAt(lp.y, 0.56, 0.012);\n" +
          "  diffuseColor.rgb *= 1.0 - 0.5 * clamp(seam, 0.0, 1.0);\n" +
          // фары, решётка, задние огни
          "  float headL = frontN * smoothstep(0.3, 0.4, abs(lp.x)) * (1.0 - smoothstep(0.78, 0.86, abs(lp.x))) * smoothstep(0.52, 0.58, lp.y) * (1.0 - smoothstep(0.7, 0.76, lp.y)) * step(lp.z, -1.7);\n" +
          "  float grille = frontN * (1.0 - smoothstep(0.26, 0.32, abs(lp.x))) * smoothstep(0.42, 0.47, lp.y) * (1.0 - smoothstep(0.6, 0.66, lp.y)) * step(lp.z, -1.7);\n" +
          "  float tailL = rearN * smoothstep(0.28, 0.36, abs(lp.x)) * (1.0 - smoothstep(0.76, 0.84, abs(lp.x))) * smoothstep(0.64, 0.7, lp.y) * (1.0 - smoothstep(0.82, 0.88, lp.y)) * step(1.7, lp.z);\n" +
          "  vec3 dark = vec3(0.012, 0.018, 0.03);\n" +
          "  diffuseColor.rgb = mix(diffuseColor.rgb, dark, clamp(glass, 0.0, 1.0));\n" +
          "  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), grille);\n" +
          "  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.95, 1.0), headL);\n" +
          "  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.02, 0.05), tailL);\n" +
          "  float darkSeamBack = 0.0;\n" +
          "  vec3 emissiveExtra = vec3(0.0); emissiveExtra += headL * vec3(0.55, 0.62, 0.7); emissiveExtra += tailL * vec3(0.55, 0.0, 0.03);\n" +
          "  emissiveExtra += uRed * red * (0.16 + 0.1 * sin(uTime * 3.2)) * (1.0 - glass);\n")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.12, glass); roughnessFactor = mix(roughnessFactor, 0.7, grille);\n")
        .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n  #ifdef USE_CLEARCOAT\n  material.clearcoat *= (1.0 - glass * 0.97);\n  #endif\n  ")
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 0.0, glass); metalnessFactor = mix(metalnessFactor, 0.0, headL + tailL + grille + amb * 0.5);\n")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += emissiveExtra;\n" +
          "  if(!gl_FrontFacing){ diffuseColor.rgb = vec3(0.02, 0.025, 0.035); totalEmissiveRadiance = vec3(0.0); }\n");
      // «задняя грань» (подкрылок/салон) — тёмная и матовая
      sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  if(!gl_FrontFacing){ roughnessFactor = 0.95; }");
    };
    return mat;
  }

  // ---------------- сцена ----------------
  function makeEnv(THREE, renderer){
    var cv = document.createElement("canvas"); cv.width = 512; cv.height = 256;
    var g = cv.getContext("2d");
    var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#dfe6ee"); gr.addColorStop(0.5, "#9aa5b4"); gr.addColorStop(1, "#5b6574");
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.fillStyle = "rgba(255,255,255,.95)"; g.fillRect(40, 40, 110, 34); g.fillRect(300, 28, 150, 30);
    g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(190, 90, 60, 18);
    var tex = new THREE.CanvasTexture(cv); tex.mapping = THREE.EquirectangularReflectionMapping; tex.encoding = THREE.sRGBEncoding;
    var pm = new THREE.PMREMGenerator(renderer);
    var env = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose();
    return env;
  }
  function shadowTexture(THREE){
    var cv = document.createElement("canvas"); cv.width = cv.height = 256;
    var g = cv.getContext("2d"), r = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    r.addColorStop(0, "rgba(10,14,22,.55)"); r.addColorStop(0.55, "rgba(10,14,22,.22)"); r.addColorStop(1, "rgba(10,14,22,0)");
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
  }
  function addWheels(THREE, car){
    var tireM = new THREE.MeshStandardMaterial({color:0x15181e, roughness:0.88, metalness:0});
    var rimM = new THREE.MeshStandardMaterial({color:0xc4cbd5, roughness:0.22, metalness:1});
    var darkM = new THREE.MeshStandardMaterial({color:0x0b0d11, roughness:0.9, metalness:0});
    [-1, 1].forEach(function(sz){
      var wz = sz * 1.38;
      [-1, 1].forEach(function(sx){
        var w = new THREE.Group();
        var tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.27, 40), tireM); tire.rotation.z = Math.PI / 2; w.add(tire);
        var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.285, 36), rimM); rim.rotation.z = Math.PI / 2; w.add(rim);
        var dish = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.292, 30), darkM); dish.rotation.z = Math.PI / 2; w.add(dish);
        for(var k = 0; k < 5; k++){
          var sp = new THREE.Mesh(new THREE.BoxGeometry(0.296, 0.06, 0.4), rimM);
          sp.rotation.x = k / 5 * Math.PI; w.add(sp);
        }
        var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 20), rimM); cap.rotation.z = Math.PI / 2; w.add(cap);
        var xo = sideX(wz, 0.4) - 0.16;
        w.position.set(sx * xo, 0.4, wz);
        car.add(w);
      });
    });
    // подкрылок-тень внутри арки, чтобы между колесом и кузовом не было «просвета»
  }
  function addMirrors(THREE, car, bodyMat){
    var mm = new THREE.MeshStandardMaterial({color:0xcdd4de, metalness:0.55, roughness:0.32});
    [-1, 1].forEach(function(sx){
      var m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mm);
      m.scale.set(0.085, 0.055, 0.13);
      var x = sideX(-0.55, 0.98);
      m.position.set(sx * (x + 0.045), 0.99, -0.55);
      car.add(m);
    });
  }

  var instances = [];
  var rafId = 0, lastT = 0;
  function loop(t){
    rafId = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    for(var i = instances.length - 1; i >= 0; i--){
      var inst = instances[i];
      if(!inst.node.isConnected){ destroy(inst); instances.splice(i, 1); continue; }
      if(inst.visible) frame(inst, dt, t / 1000);
    }
    if(!instances.length){ cancelAnimationFrame(rafId); rafId = 0; }
  }
  function destroy(inst){
    try{ inst.io && inst.io.disconnect(); inst.ro && inst.ro.disconnect(); inst.renderer.dispose(); inst.renderer.forceContextLoss && inst.renderer.forceContextLoss(); }catch(_){}
  }
  var reduce = false; try{ reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(_){}

  function frame(inst, dt, t){
    var THREE = inst.THREE;
    // анимация камеры к целевому виду
    var k = 1 - Math.pow(0.0008, dt);
    if(inst.tween){
      var da = inst.tween.az - inst.az; da = Math.atan2(Math.sin(da), Math.cos(da));
      inst.az += da * k; inst.elv += (inst.tween.el - inst.elv) * k;
      if(Math.abs(da) < 0.003 && Math.abs(inst.tween.el - inst.elv) < 0.003){ inst.center = inst.az; inst.tween = null; }
    }else if(!inst.drag){
      inst.idle += dt;
      if(inst.idle > 3.5 && !reduce){ inst.az = inst.center + Math.sin(t * 0.55) * 0.42; }
      else if(inst.idle <= 3.5 && !inst.drag){ /* держим */ }
    }
    if(inst.vel && !inst.drag){ inst.az += inst.vel * dt; inst.vel *= Math.pow(0.04, dt); if(Math.abs(inst.vel) < 0.02) inst.vel = 0; inst.center = inst.az; }
    var cam = inst.camera, R = inst.R, ce = Math.cos(inst.elv);
    cam.position.set(Math.sin(inst.az) * ce * R, 0.55 + Math.sin(inst.elv) * R, Math.cos(inst.az) * ce * R);
    cam.lookAt(0, 0.62, 0);
    inst.mat.userData.uni.uTime.value = t;
    inst.renderer.render(inst.scene, cam);
    // метка у основного удара
    if(inst.mark && inst.markPos){
      var v = inst.markPos.clone().project(cam);
      var cdir = new THREE.Vector3().copy(cam.position).normalize();
      var facing = inst.markN.dot(cdir) > 0.05;
      var w = inst.canvasWrap.clientWidth, h = inst.canvasWrap.clientHeight;
      if(facing && v.z < 1){
        inst.mark.hidden = false;
        var px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h;
        inst.mark.style.transform = "translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px)";
        inst.mark.classList.toggle("flipV1", px > w * 0.62);
      }else inst.mark.hidden = true;
    }
  }

  function mount(el){
    if(el.getAttribute("data-m")) return;
    el.setAttribute("data-m", "1");
    var zones; try{ zones = JSON.parse(el.getAttribute("data-zones") || "{}"); }catch(_){ zones = {}; }
    var io = new IntersectionObserver(function(es){
      if(es.some(function(e){ return e.isIntersecting; })){ io.disconnect(); start(el, zones); }
    }, {rootMargin:"300px"});
    io.observe(el);
  }
  function start(el, zones){
    loadThree().then(function(THREE){
      if(!el.isConnected) return;
      try{ build(el, zones, THREE); }catch(e){ el.classList.add("no3dV1"); if(window.console) console.warn("[damage3d]", e); }
    }).catch(function(){ el.classList.add("no3dV1"); });
  }
  function build(el, zones, THREE){
    if(THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    var wrap = el.querySelector(".dmg3dCanvasV1");
    var W = wrap.clientWidth || 480, H = wrap.clientHeight || 300;
    var renderer;
    try{ renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:"low-power"}); }
    catch(e){ el.classList.add("no3dV1"); return; }
    if(!renderer.getContext()){ el.classList.add("no3dV1"); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    renderer.domElement.className = "dmg3dGlV1";
    wrap.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.environment = makeEnv(THREE, renderer);
    var camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 60);
    var sun = new THREE.DirectionalLight(0xffffff, 1.25); sun.position.set(-3, 6, 4); scene.add(sun);
    var fill = new THREE.DirectionalLight(0xbfd0ff, 0.5); fill.position.set(4, 3, -5); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a0, 0.22));

    var zoneArr = new Array(9).fill(0);
    for(var key in zones){ if(ZONE_IDX[key] != null) zoneArr[ZONE_IDX[key]] = Number(zones[key]) || 0; }
    var car = new THREE.Group();
    var mat = makeBodyMaterial(THREE, zoneArr);
    car.add(new THREE.Mesh(buildBodyGeometry(THREE), mat));
    addWheels(THREE, car);
    addMirrors(THREE, car, mat);
    scene.add(car);

    // тень и «подиум»
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.2), new THREE.MeshBasicMaterial({map:shadowTexture(THREE), transparent:true, depthWrite:false}));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.002; scene.add(sh);
    var ring = new THREE.Mesh(new THREE.RingGeometry(3.15, 3.19, 96), new THREE.MeshBasicMaterial({color:0x9aa5b4, transparent:true, opacity:0.45, side:THREE.DoubleSide}));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; scene.add(ring);

    // основное повреждение: куда смотреть и где метка
    var main = el.getAttribute("data-main") || "";
    var focus = ZONE_AZ[main] != null ? ZONE_AZ[main] : -2.35;
    var elev = main === "T" ? 0.85 : 0.34;
    var inst = {node:el, THREE:THREE, renderer:renderer, scene:scene, camera:camera, mat:mat, canvasWrap:wrap,
      az:focus, center:focus, elv:elev, idle:0, drag:false, vel:0, tween:null, visible:true, R:9.2};
    var names; try{ names = JSON.parse(el.getAttribute("data-names") || "{}"); }catch(_){ names = {}; }
    var mark = el.querySelector(".dmg3dMarkV1");
    if(mark && ZONE_POS[main]){
      var zp = ZONE_POS[main];
      inst.markPos = new THREE.Vector3(zp[0], zp[1], zp[2]); inst.markN = new THREE.Vector3(zp[3], zp[4], zp[5]).normalize();
      inst.mark = mark; mark.hidden = true;
    }
    fit(inst, W, H);

    // управление: перетаскивание
    var dom = renderer.domElement, lastX = 0, lastY = 0, lastTs = 0;
    dom.style.touchAction = "pan-y";
    dom.addEventListener("pointerdown", function(e){
      inst.drag = true; inst.tween = null; inst.vel = 0; inst.idle = 0; lastX = e.clientX; lastY = e.clientY; lastTs = performance.now();
      try{ dom.setPointerCapture(e.pointerId); }catch(_){}
      el.classList.add("dragV1"); el.classList.add("usedV1");
    });
    dom.addEventListener("pointermove", function(e){
      if(!inst.drag) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY, now = performance.now(), dtm = Math.max(1, now - lastTs);
      inst.az -= dx * 0.0085; inst.elv = Math.min(1.5, Math.max(0.05, inst.elv + dy * 0.006));
      inst.vel = -dx * 0.0085 / (dtm / 1000) * 0.5; lastX = e.clientX; lastY = e.clientY; lastTs = now;
      inst.center = inst.az; inst.idle = 0;
    });
    function up(e){ if(!inst.drag) return; inst.drag = false; el.classList.remove("dragV1"); inst.idle = 0; try{ dom.releasePointerCapture(e.pointerId); }catch(_){} }
    dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", function(e){ if(e.ctrlKey || e.metaKey){ e.preventDefault(); inst.R = Math.min(14, Math.max(6.5, inst.R + e.deltaY * 0.01)); } }, {passive:false});
    // кнопки видов
    el.querySelectorAll("[data-v]").forEach(function(b){
      b.addEventListener("click", function(){
        var v = VIEWS[b.getAttribute("data-v")]; if(!v) return;
        inst.tween = {az:v[0], el:v[1]}; inst.idle = 0;
        el.querySelectorAll("[data-v]").forEach(function(x){ x.classList.toggle("onV1", x === b); });
        el.classList.add("usedV1");
      });
    });
    // размер / видимость
    inst.ro = new ResizeObserver(function(){ var w = wrap.clientWidth, h = wrap.clientHeight; if(w && h) fit(inst, w, h); });
    inst.ro.observe(wrap);
    inst.io = new IntersectionObserver(function(es){ inst.visible = es.some(function(e){ return e.isIntersecting; }); }, {rootMargin:"60px"});
    inst.io.observe(el);
    document.addEventListener("visibilitychange", function(){ if(document.hidden) inst.visible = false; });
    el.classList.add("is3dV1");
    instances.push(inst);
    frame(inst, 0.016, 0);     // сразу первый кадр — без вспышки пустого холста
    if(!rafId){ lastT = performance.now(); rafId = requestAnimationFrame(loop); }
  }
  function fit(inst, w, h){
    inst.renderer.setSize(w, h, false);
    inst.camera.aspect = w / h;
    // на узком холсте отодвигаем камеру, чтобы машина целиком влезала
    inst.R = w / h < 1.25 ? 8.6 : 7.4;
    inst.camera.updateProjectionMatrix();
  }

  function scan(root){
    (root || document).querySelectorAll(".dmg3dStageV1:not([data-m])").forEach(mount);
  }
  window.apexDmg3d = {scan:scan};
  // страница лота дорисовывается JS-ом (SPA) — следим за появлением блока
  var scanTimer = 0;
  var mo = new MutationObserver(function(){ if(scanTimer) return; scanTimer = setTimeout(function(){ scanTimer = 0; scan(); }, 150); });
  function boot(){ scan(); mo.observe(document.body, {childList:true, subtree:true}); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
