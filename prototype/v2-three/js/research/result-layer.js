// Pure rendering adapter. Sampling and zoom never alter the computed trajectories.
export const MAX_VISIBLE_PARTICLES = 500;
const COLORS = ['#82e1cf', '#efb36d'];
export function wrapLongitude(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }
export function visibleSample(samples, time) {
  let lo = 0, hi = samples.length - 1, result = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (Date.parse(samples[mid].timeUTC) <= time) { result = mid; lo = mid + 1; } else hi = mid - 1; }
  return result < 0 ? null : samples[result];
}
export function normalizeResult(result) {
  const trajectories = (result?.trajectories || []).map(trajectory => ({ ...trajectory,
    samples: (trajectory.samples || []).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat) && Number.isFinite(Date.parse(p.timeUTC))).slice().sort((a, b) => Date.parse(a.timeUTC) - Date.parse(b.timeUTC)),
  }));
  return { ...result, trajectories };
}
export class ResultLayer {
  constructor({ canvas, globeHost, empty, note, onTime, onSelectPoint }) {
    Object.assign(this, { canvas, globeHost, empty, note, onTime, onSelectPoint });
    this.results = []; this.time = null; this.mode = '2d'; this.globe = null; this.globePromise = null;
    this.extentMode = 'trajectory'; this.referenceRings = []; this.referencePromise = null;
    this.observer = new ResizeObserver(() => this.render()); this.observer.observe(canvas.parentElement);
  }
  setResults(results) {
    this.loadReference();
    this.results = results.filter(Boolean).map(normalizeResult);
    this.times = [...new Set(this.results.flatMap(r => r.trajectories.flatMap(t => t.samples.map(p => Date.parse(p.timeUTC)))))].sort((a, b) => a - b);
    if (this.results.length > 1) {
      const ranges = this.results.map(r => r.trajectories.reduce((range, trajectory) => {
        if (trajectory.samples.length) { range[0] = Math.min(range[0], Date.parse(trajectory.samples[0].timeUTC)); range[1] = Math.max(range[1], Date.parse(trajectory.samples.at(-1).timeUTC)); } return range;
      }, [Infinity, -Infinity]));
      const sharedStart = Math.max(...ranges.map(r => r[0])), sharedEnd = Math.min(...ranges.map(r => r[1]));
      this.times = this.times.filter(t => t >= sharedStart && t <= sharedEnd);
    }
    this.time = this.times.at(-1) ?? null;
    this.empty.hidden = this.times.length > 0;
    const total = this.results.reduce((sum, r) => sum + r.trajectories.length, 0);
    const shown = this.results.reduce((sum, r) => sum + this.selected(r).length, 0);
    this.note.textContent = `계산 입자 ${total.toLocaleString()}개 · 화면 표본 ${shown.toLocaleString()}개. 선택 UTC 이전의 최근 저장 위치를 표시합니다.${this.results.length > 1 ? ' 두 결과가 함께 있는 기간만 재생합니다.' : ''} 입력 격자는 각 축 최대 60선으로 표시합니다. 화면 표본 추출은 계산 원본을 변경하지 않습니다.`;
    if (this.globe) this.globe.centered = false;
    this.render(); return this.times;
  }
  setTime(time) { this.time = time; this.render(); }
  setExtent(mode) { this.extentMode = mode; this.render(); }
  async loadReference() {
    if (!this.referencePromise) this.referencePromise = (async () => {
      try {
        const response = await fetch(new URL('../../data/country-reference.json', import.meta.url)); if (!response.ok) throw new Error('reference unavailable');
        const data = await response.json();
        this.referenceRings = (data.features || []).flatMap(feature => feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates.flat() : []);
        const status = document.getElementById('map-status'); if (status) status.textContent = '참조 지형 로드됨.';
        this.render();
      } catch { const status = document.getElementById('map-status'); if (status) status.textContent = '참조 지형을 불러오지 못했습니다. 좌표·격자만 표시합니다.'; }
    })();
    return this.referencePromise;
  }
  selected(result) {
    const stride = Math.max(1, Math.ceil(result.trajectories.length / MAX_VISIBLE_PARTICLES));
    return result.trajectories.filter((_, i) => i % stride === 0).slice(0, MAX_VISIBLE_PARTICLES);
  }
  async setMode(mode) {
    if (mode === '3d' && !this.globe) {
      if (!this.globePromise) this.globePromise = this.createGlobe().catch(error => { this.globePromise = null; throw error; });
      await this.globePromise;
    }
    this.mode = mode; this.canvas.hidden = mode !== '2d'; this.globeHost.hidden = mode !== '3d'; this.render();
  }
  draw2D() {
    const box = this.canvas.parentElement.getBoundingClientRect(); if (!box.width || !box.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), w = box.width, h = box.height;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    const ctx = this.canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const all = this.results.flatMap(r => this.selected(r).flatMap(t => t.samples));
    if (this.extentMode === 'input') this.results.forEach(result => { const area = result.displayContext?.area; if (area) all.push({lon:area.west,lat:area.south},{lon:area.east,lat:area.north}); });
    // Circular longitude bounds retain continuous trajectories across the dateline.
    const anchor = all[0]?.lon || 0;
    const relative = lon => anchor + wrapLongitude(lon - anchor);
    const extent = all.reduce((b, p) => [Math.min(b[0], relative(p.lon)), Math.max(b[1], relative(p.lon)), Math.min(b[2], p.lat), Math.max(b[3], p.lat)], [Infinity, -Infinity, Infinity, -Infinity]);
    let [west, east, south, north] = all.length ? extent : [-180, 180, -90, 90];
    const centerX = (west + east) / 2, centerY = (south + north) / 2;
    let spanX = Math.max(.01, east - west) * 1.35, spanY = Math.max(.01, north - south) * 1.35;
    const margin = 42, iw = w - margin * 2, ih = h - margin * 2;
    if (spanX / spanY < iw / ih) spanX = spanY * iw / ih; else spanY = spanX * ih / iw;
    west = centerX - spanX / 2; east = centerX + spanX / 2; south = centerY - spanY / 2; north = centerY + spanY / 2;
    const project = (lon, lat) => [margin + (relative(lon) - west) / spanX * iw, margin + (north - lat) / spanY * ih];
    ctx.font = '10px system-ui'; ctx.lineWidth = 1; ctx.strokeStyle = '#244352'; ctx.fillStyle = '#819ca9';
    for (let i = 0; i <= 6; i++) {
      const x = margin + iw * i / 6, y = margin + ih * i / 6;
      ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, h - margin); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(w - margin, y); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(`${wrapLongitude(west + spanX * i / 6).toFixed(2)}°`, x, h - 20);
      ctx.textAlign = 'left'; ctx.fillText(`${(north - spanY * i / 6).toFixed(2)}°`, 3, y + 4);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(margin, margin, iw, ih); ctx.clip();
    ctx.strokeStyle = '#547481'; ctx.fillStyle = '#1b3440'; ctx.lineWidth = .7;
    for (const ring of this.referenceRings) {
      if (!ring.length) continue;
      const ringWest = Math.min(...ring.map(p => relative(p[0]))), ringEast = Math.max(...ring.map(p => relative(p[0]))), ringSouth = Math.min(...ring.map(p => p[1])), ringNorth = Math.max(...ring.map(p => p[1]));
      if (ringEast < west || ringWest > east || ringNorth < south || ringSouth > north) continue;
      ctx.beginPath(); let previous;
      ring.forEach(p => { const [x, y] = project(p[0], p[1]); if (!previous || Math.abs(relative(p[0]) - relative(previous[0])) > 180) ctx.moveTo(x, y); else ctx.lineTo(x, y); previous = p; }); ctx.stroke();
    }
    this.results.forEach((result, index) => {
      const context = result.displayContext || {}, grid = context.grid || {}, area = context.area;
      ctx.strokeStyle = COLORS[index % 2]; ctx.lineWidth = 1; ctx.globalAlpha = .22; ctx.setLineDash([3, 5]);
      if (grid.lon?.length && grid.lat?.length) {
        const latMin = Math.min(...grid.lat), latMax = Math.max(...grid.lat), lonMin = Math.min(...grid.lon), lonMax = Math.max(...grid.lon);
        const gridLine = (lon1, lat1, lon2, lat2) => { ctx.beginPath(); ctx.moveTo(...project(lon1, lat1)); ctx.lineTo(...project(lon2, lat2)); ctx.stroke(); };
        grid.lon.filter((_, i) => i % Math.max(1, Math.ceil(grid.lon.length / 60)) === 0).forEach(lon => gridLine(lon, latMin, lon, latMax));
        grid.lat.filter((_, i) => i % Math.max(1, Math.ceil(grid.lat.length / 60)) === 0).forEach(lat => gridLine(lonMin, lat, lonMax, lat));
      }
      if (area) { ctx.globalAlpha = .65; ctx.setLineDash([6, 4]); ctx.beginPath(); [[area.west, area.south], [area.east, area.south], [area.east, area.north], [area.west, area.north], [area.west, area.south]].forEach(([lon, lat], i) => { const xy = project(lon, lat); if (i) ctx.lineTo(...xy); else ctx.moveTo(...xy); }); ctx.stroke(); }
    }); ctx.setLineDash([]); ctx.globalAlpha = 1;
    this.results.forEach((result, index) => {
      ctx.strokeStyle = COLORS[index % COLORS.length]; ctx.fillStyle = COLORS[index % COLORS.length]; ctx.lineWidth = 1.3;
      this.selected(result).forEach(trajectory => {
        const samples = trajectory.samples.filter(p => Date.parse(p.timeUTC) <= this.time); if (!samples.length) return;
        ctx.globalAlpha = .45; ctx.beginPath(); let previous;
        samples.forEach(p => { const [x, y] = project(p.lon, p.lat); if (!previous || Math.abs(relative(p.lon) - relative(previous.lon)) > 180) ctx.moveTo(x, y); else ctx.lineTo(x, y); previous = p; }); ctx.stroke();
        const last = samples.at(-1), [x, y] = project(last.lon, last.lat); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      });
    });
    ctx.globalAlpha = 1; ctx.restore();
  }
  async createGlobe() {
    await this.loadReference();
    const THREE = await import('../../../vendor/three-r184.module.min.js');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .1, 100), renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); camera.position.set(0, 0, 3.3); this.globeHost.append(renderer.domElement);
    const group = new THREE.Group(); scene.add(group);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(.996, 48, 32), new THREE.MeshBasicMaterial({ color: 0x102b3b })); group.add(sphere);
    const xyz = (lon, lat, r = 1.003) => { const p = lat * Math.PI / 180, t = lon * Math.PI / 180; return new THREE.Vector3(r * Math.cos(p) * Math.sin(t), r * Math.sin(p), r * Math.cos(p) * Math.cos(t)); };
    const gridPoints = [];
    for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 3) gridPoints.push(xyz(lon, lat), xyz(lon + 3, lat));
    for (let lon = -180; lon < 180; lon += 15) for (let lat = -90; lat < 90; lat += 3) gridPoints.push(xyz(lon, lat), xyz(lon, lat + 3));
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), new THREE.LineBasicMaterial({ color: 0x2d5366, transparent: true, opacity: .8 })));
    const coastPoints = [];
    this.referenceRings.forEach(ring => { for (let i = 1; i < ring.length; i++) coastPoints.push(xyz(ring[i-1][0],ring[i-1][1],1.005),xyz(ring[i][0],ring[i][1],1.005)); });
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(coastPoints), new THREE.LineBasicMaterial({ color: 0x77929c, transparent: true, opacity: .8 })));
    const resultGroup = new THREE.Group(); group.add(resultGroup);
    let dragging = false, lastX, lastY;
    renderer.domElement.addEventListener('pointerdown', event => { dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); });
    renderer.domElement.addEventListener('pointermove', event => { if (!dragging) return; group.rotation.y += (event.clientX - lastX) * .008; group.rotation.x += (event.clientY - lastY) * .008; lastX = event.clientX; lastY = event.clientY; renderer.render(scene, camera); });
    renderer.domElement.addEventListener('pointerup', () => { dragging = false; }); renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
    renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', '입자 지구. 화살표 키로 회전, 더하기·빼기 키로 확대·축소.');
    renderer.domElement.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) { event.preventDefault(); if (event.key === 'ArrowLeft') group.rotation.y -= .1; if (event.key === 'ArrowRight') group.rotation.y += .1; if (event.key === 'ArrowUp') group.rotation.x -= .1; if (event.key === 'ArrowDown') group.rotation.x += .1; if (event.key === '+' || event.key === '=') camera.position.z = Math.max(1.5, camera.position.z - .2); if (event.key === '-') camera.position.z = Math.min(6, camera.position.z + .2); renderer.render(scene, camera); } });
    renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); camera.position.z = Math.max(1.5, Math.min(6, camera.position.z + event.deltaY * .003)); renderer.render(scene, camera); }, { passive: false });
    this.globe = { THREE, scene, camera, renderer, group, resultGroup, xyz, centered: false };
  }
  drawGlobe() {
    const g = this.globe; if (!g) return;
    const { width, height } = this.globeHost.getBoundingClientRect(); if (!width || !height) return;
    g.renderer.setSize(width, height, false); g.camera.aspect = width / height; g.camera.updateProjectionMatrix();
    while (g.resultGroup.children.length) { const child = g.resultGroup.children[0]; g.resultGroup.remove(child); child.geometry.dispose(); child.material.dispose(); }
    this.results.forEach((result, index) => {
      const segments = [], positions = [];
      const area = result.displayContext?.area;
      if (area) {
        const corners = [[area.west,area.south],[area.east,area.south],[area.east,area.north],[area.west,area.north],[area.west,area.south]];
        const bounds = [];
        for (let i=1;i<corners.length;i++) { const [a,b]=[corners[i-1],corners[i]], steps=Math.max(1,Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])))); for(let j=0;j<steps;j++) { bounds.push(g.xyz(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps,1.006),g.xyz(a[0]+(b[0]-a[0])*(j+1)/steps,a[1]+(b[1]-a[1])*(j+1)/steps,1.006)); } }
        g.resultGroup.add(new g.THREE.LineSegments(new g.THREE.BufferGeometry().setFromPoints(bounds),new g.THREE.LineBasicMaterial({color:COLORS[index%2],transparent:true,opacity:.3})));
      }
      this.selected(result).forEach(trajectory => {
        const samples = trajectory.samples.filter(p => Date.parse(p.timeUTC) <= this.time);
        for (let i = 1; i < samples.length; i++) segments.push(g.xyz(samples[i - 1].lon, samples[i - 1].lat), g.xyz(samples[i].lon, samples[i].lat));
        const last = samples.at(-1); if (last) positions.push(g.xyz(last.lon, last.lat, 1.007));
      });
      g.resultGroup.add(new g.THREE.LineSegments(new g.THREE.BufferGeometry().setFromPoints(segments), new g.THREE.LineBasicMaterial({ color: COLORS[index % 2], transparent: true, opacity: .65 })));
      g.resultGroup.add(new g.THREE.Points(new g.THREE.BufferGeometry().setFromPoints(positions), new g.THREE.PointsMaterial({ color: COLORS[index % 2], size: 4, sizeAttenuation: false })));
    });
    if (!g.centered) { const first = this.results[0]?.trajectories[0]?.samples[0]; if (first) { g.group.rotation.y = -first.lon * Math.PI / 180; g.group.rotation.x = first.lat * Math.PI / 180; g.centered = true; } }
    g.renderer.render(g.scene, g.camera);
  }
  render() { if (this.mode === '3d') this.drawGlobe(); else this.draw2D(); }
  dispose() { this.observer.disconnect(); if (this.globe) { this.globe.scene.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); }); this.globe.renderer.dispose(); } }
}
