
// === NRG v29 Preview: Smart Devices (Bridge stub + Demo mode) ===
(function(){
  document.addEventListener('DOMContentLoaded', function(){

  const qs = (s)=>document.querySelector(s);
  const qsa= (s)=>Array.from(document.querySelectorAll(s));
  const modal = qs('#sd-modal');
  const openBtn = qs('#btn-connect');
  const closeBtn= qs('#sd-close');
  const urlInp = qs('#sd-url');
  const statusEl= qs('#sd-status');
  const listEl = qs('#sd-list');
  const adpBtns = qsa('.sd-adp');
  const btnConn = qs('#sd-connect');
  const btnDemo = qs('#sd-demo');
  let ws = null;
  let connected = false;
  let demo = false;

  function openModal(){ modal.style.display='flex'; modal.setAttribute('aria-hidden','false'); }
  function closeModal(){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }
  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);

  function setStatus(msg){ statusEl.textContent = msg; }

  function renderDevices(devs){
    listEl.innerHTML = '';
    devs.forEach(d=>{
      const row = document.createElement('div');
      row.className = 'sd-item';
      row.innerHTML = `
        <div class="sd-name">${d.name}</div>
        <div class="sd-meta">${d.adapter} • ${d.ip || '—'} • ${d.watts!=null? (d.watts+' W'):'—'}</div>
        <button class="nrg-btn sd-btn" data-id="${d.id}" data-action="toggle">${d.on ? 'Turn Off' : 'Turn On'}</button>
        <button class="nrg-btn sd-btn" data-id="${d.id}" data-action="link">Link to Item…</button>
      `;
      listEl.appendChild(row);
    });
    qsa('.sd-btn').forEach(b=> b.addEventListener('click', handleDeviceAction));
  }

  function handleDeviceAction(e){
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action==='toggle'){
      if (demo){
        // flip demo state locally
        const item = DEMO_DEVICES.find(x=>x.id===id);
        if (item){ item.on = !item.on; renderDevices(DEMO_DEVICES); }
      }else if (connected && ws && ws.readyState===1){
        ws.send(JSON.stringify({type:'setState', id, on:'toggle'}));
      }
    } else if (action==='link'){
      const name = prompt('Link this device to which NRG item name? (e.g., TV, Fridge)');
      if (!name) return;
      alert('Linked '+id+' → '+name+' (mapping stored locally)');
      // TODO: persist mapping; for preview we only show confirmation
    }
  }

  // Adapter discovery
  adpBtns.forEach(b=> b.addEventListener('click', ()=>{
    const adp = b.getAttribute('data-adp');
    if (demo){
      const devs = DEMO_DEVICES.filter(x=>x.adapter===adp);
      renderDevices(devs);
    }else if (connected && ws && ws.readyState===1){
      ws.send(JSON.stringify({type:'discover', adapter: adp}));
    }else{
      alert('Connect to a Bridge or use Demo Mode.');
    }
  }));

  // Demo devices
  const DEMO_DEVICES = [
    {id:'kasa:plug:tv',     adapter:'kasa',    name:'Living TV Plug', ip:'192.168.1.51', on:true,  watts: 78},
    {id:'kasa:plug:router', adapter:'kasa',    name:'Router Plug',    ip:'192.168.1.52', on:true,  watts: 12},
    {id:'shelly:sw:lamp',   adapter:'shelly',  name:'Bedroom Lamp',   ip:'192.168.1.61', on:false, watts:  0},
    {id:'tasmota:fan',      adapter:'tasmota', name:'Box Fan',        ip:'192.168.1.71', on:true,  watts: 45},
    {id:'hue:bulb:desk',    adapter:'hue',     name:'Desk Bulb',      ip:'—',            on:false, watts:  7}
  ];

  // Bridge connection
  btnConn?.addEventListener('click', ()=>{
    try{
      demo = false;
      if (ws){ try{ ws.close(); }catch{} }
      const url = (urlInp.value||'').trim();
      ws = new WebSocket(url);
      setStatus('Connecting to '+url+'…');
      ws.onopen = ()=>{ connected=true; setStatus('Connected to Bridge. Choose an adapter to discover.'); };
      ws.onclose= ()=>{ connected=false; setStatus('Disconnected.'); };
      ws.onerror= ()=>{ connected=false; setStatus('Error connecting. Check address or use Demo Mode.'); };
      ws.onmessage = (ev)=>{
        try{
          const msg = JSON.parse(ev.data||'{}');
          if (msg.type==='devices' && Array.isArray(msg.items)){ renderDevices(msg.items); }
          if (msg.type==='state' && msg.id){
            // update a single device state if present
          }
        }catch(e){}
      };
    }catch(e){
      setStatus('Could not open Bridge: '+(e?.message||e));
    }
  });

  // Demo mode
  btnDemo?.addEventListener('click', ()=>{
    demo = true; connected = false;
    setStatus('Demo Mode: using example devices on this page only.');
    renderDevices(DEMO_DEVICES);
  });

  });
})();


// === NRG AI Advisor (Preview): local heuristics for savings tips ===
(function(){
  const $ = (id)=>document.getElementById(id);
  const tipsBox = $('ai-tips');
  const runBtn  = $('ai-run');
  if (!tipsBox || !runBtn) return;

  function fmt$(x){ return '$' + (x||0).toFixed(2); }
  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function deviceKwhMonth(d){
    const dim = monthDays();
    const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1;
    return (w*h*duty*q/1000) * dim;
  }

  function makeTip(title, save, body, tag){
    const div = document.createElement('div');
    div.className = 'ai-tip';
    div.innerHTML = `
      <div class="ai-head">
        <div><span class="ai-title">${title}</span>${tag?`<span class="ai-tag">${tag}</span>`:''}</div>
        <div class="ai-save">${fmt$(save)} / mo</div>
      </div>
      <div class="ai-body">${body}</div>
    `;
    return div;
  }

  function inOffpeak(startH, endH, testH){
    if (startH===endH) return true; // degenerate = full day
    if (startH < endH){
      return testH >= startH && testH < endH;
    }else{
      // window wraps midnight
      return testH >= startH || testH < endH;
    }
  }

  runBtn.addEventListener('click', ()=>{
    const peak = parseFloat($('ai-peak').value||'0.22')||0.22;
    const off  = parseFloat($('ai-off').value||'0.12')||0.12;
    let start = parseInt($('ai-start').value||'22',10); if (isNaN(start)) start=22;
    let end   = parseInt($('ai-end').value||'7',10); if (isNaN(end)) end=7;
    const dim = monthDays();

    if (!Array.isArray(devices) || devices.length===0){
      tipsBox.innerHTML = '<div class="ai-tip"><div class="ai-body">Add some devices first, then click Generate Tips.</div></div>';
      return;
    }

    const out = [];
    const lower = Math.max(0, peak - off);

    // 1) Laundry shift (Washer/Dryer) to off-peak
    const wash = devices.find(d=> /washer/i.test(d.name||''));
    const dry  = devices.find(d=> /dryer/i.test(d.name||''));
    const laundry = [wash, dry].filter(Boolean);
    if (laundry.length){
      const kwh = laundry.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      // assume baseline run occurs at peak; savings = kwh * (peak - off)
      const save = kwh * lower;
      if (save > 0.5){
        out.push(makeTip(
          "Shift laundry to off‑peak ("+start+":00→"+end+":00)",
          save,
          `Washer/Dryer use ~${kwh.toFixed(1)} kWh / month. If you run cycles during your off‑peak window, you avoid the higher rate (Δ=${fmt$(lower)}/kWh).`,
          "schedule"
        ));
      }
    }

    // 2) LED swap suggestion for high‑watt lamps
    const candidates = devices.filter(d=> /(lamp|bulb)/i.test(d.name||'') && (+d.watts||0) >= 40);
    if (candidates.length){
      const kwhOld = candidates.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      // Assume LED @ 10 W, same hours
      const ledCandidates = candidates.map(d=> ({...d, watts:10}));
      const kwhNew = ledCandidates.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const saveKwh = Math.max(0, kwhOld - kwhNew);
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const save = saveKwh * rate;
      if (save > 0.5){
        out.push(makeTip(
          "Swap high‑watt bulbs for LED",
          save,
          `Found ${candidates.length} lamp(s) over 40W. Replacing with 10W LEDs saves ~${saveKwh.toFixed(1)} kWh/month at your current rate (${fmt$(rate)}/kWh).`,
          "hardware"
        ));
      }
    }

    // 3) Phantom loads (always‑on small devices)
    const phantoms = devices.filter(d=> (+d.hoursPerDay)===24 && (+d.watts) >= 5 && (+d.watts) <= 20);
    if (phantoms.length){
      const kwh = phantoms.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const save = kwh * rate * 0.3; // assume 30% cut via smart plug schedules
      if (save > 0.3){
        out.push(makeTip(
          "Tame phantom loads with schedules",
          save,
          `Detected ${phantoms.length} always‑on small device(s). Using smart plugs to cut ~30% runtime could save ~${(kwh*0.3).toFixed(1)} kWh/month.`,
          "automation"
        ));
      }
    }

    // 4) Space heater trim
    const heaters = devices.filter(d=> /space\s*heater/i.test(d.name||''));
    if (heaters.length){
      const kwh = heaters.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const save = kwh * rate * 0.15; // 15% runtime trim
      if (save > 0.5){
        out.push(makeTip(
          "Trim space‑heater runtime by 15%",
          save,
          `Space heaters are costly. Trimming usage by ~15% reduces ~${(kwh*0.15).toFixed(1)} kWh/month without big comfort loss.`,
          "behavior"
        ));
      }
    }

    // 5) AC schedule if present (basic)
    const acs = devices.filter(d=> /(ac|air\s*conditioner)/i.test(d.name||''));
    if (acs.length){
      const kwh = acs.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const save = kwh * lower * 0.5; // assume half the runtime can be shifted
      if (save > 0.5){
        out.push(makeTip(
          "Pre‑cool / shift AC to off‑peak",
          save,
          `With off‑peak window ${$('ai-start').value}:00→${$('ai-end').value}:00, shifting ~50% of cooling saves the rate difference (Δ=${fmt$(lower)}/kWh).`,
          "schedule"
        ));
      }
    }

    // Render tips
    tipsBox.innerHTML = '';
    if (!out.length){
      tipsBox.innerHTML = '<div class="ai-tip"><div class="ai-body">No obvious savings found with current inputs. Try adding Washer/Dryer, Lamps, or Smart Plugs.</div></div>';
    }else{
      out.forEach(t=> tipsBox.appendChild(t));
    }
  });
})();


// === Mini Devices Panel: stats + quick list ===
(function(){
  const miniCount = document.getElementById('mini-count');
  const miniKwh   = document.getElementById('mini-kwh');
  const miniBill  = document.getElementById('mini-bill');
  const miniList  = document.getElementById('mini-list');

  if (!miniList) return;

  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function dKwh(d){ const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1; return (w*h*duty*q)/1000; }

  function renderMini(){
    try{
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const dim = monthDays();

      const count = (devices||[]).length;
      const daily = (devices||[]).reduce((s,d)=> s + dKwh(d), 0);
      const monthK = daily * dim;
      const bill   = monthK * rate;

      if (miniCount) miniCount.textContent = String(count);
      if (miniKwh)   miniKwh.textContent   = daily.toFixed(2);
      if (miniBill)  miniBill.textContent  = '$' + bill.toFixed(2);

      // Build list rows with clear source, metrics, edit, and remove controls.
      miniList.innerHTML = '';
      const inferSource = (d)=> d.source || (/(baseline|fridge|microwave|stove|washer|dryer|dehumidifier)/i.test(d.name||'') ? 'Preset' : 'User Added');
      (devices||[]).forEach((d, idx)=>{
        const row = document.createElement('div');
        row.className = 'mini-row';
        const watts = +d.watts || 0;
        const hours = +d.hoursPerDay || 0;
        const duty = +d.duty || 100;
        const qty = +d.quantity || 1;
        const monthlyKwh = dKwh(d) * dim;
        const monthlyCost = monthlyKwh * rate;
        const source = inferSource(d);
        row.innerHTML = `
          <div><div class="mini-name">${d.name||'Device'}</div><span class="mini-source">${source}</span></div>
          <div class="mini-meta">${watts} W<br>${hours} h/day</div>
          <div class="mini-meta">Duty ${duty}%<br>Qty ${qty}</div>
          <div class="mini-cost">${monthlyKwh.toFixed(1)} kWh/mo<br>$${monthlyCost.toFixed(2)}/mo</div>
          <button type="button" class="nrg-btn mini-btn mini-edit" data-idx="${idx}" title="Edit this device">Edit</button>
          <button type="button" class="nrg-btn mini-btn mini-remove" data-idx="${idx}" title="Remove this device">Remove</button>
        `;
        row.querySelector('.mini-remove')?.addEventListener('click', (e)=>{
          const i = parseInt(e.currentTarget.getAttribute('data-idx')||'-1', 10);
          if (i>=0 && i < (devices||[]).length){
            devices.splice(i,1);
            renderAll(); // re-render everything including mini panel
          }
        });
        row.querySelector('.mini-edit')?.addEventListener('click', (e)=>{
          const i = parseInt(e.currentTarget.getAttribute('data-idx')||'-1', 10);
          const item = (devices||[])[i];
          if (!item) return;
          const name = prompt('Device name', item.name || 'Device');
          if (name === null) return;
          const wattsVal = prompt('Watts', String(+item.watts || 0));
          if (wattsVal === null) return;
          const hoursVal = prompt('Hours per day', String(+item.hoursPerDay || 0));
          if (hoursVal === null) return;
          const dutyVal = prompt('Duty %', String(+item.duty || 100));
          if (dutyVal === null) return;
          const qtyVal = prompt('Quantity', String(+item.quantity || 1));
          if (qtyVal === null) return;
          item.name = (name || 'Device').trim();
          item.watts = Math.max(0, parseFloat(wattsVal) || 0);
          item.hoursPerDay = Math.max(0, parseFloat(hoursVal) || 0);
          item.duty = Math.max(0, Math.min(100, parseFloat(dutyVal) || 100));
          item.quantity = Math.max(1, parseInt(qtyVal, 10) || 1);
          item.source = item.source || source;
          renderAll();
        });
        miniList.appendChild(row);
      });
    }catch(e){ /* noop */ }
  }

  // Hook renderAll to also refresh the mini panel
  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); renderMini(); };
  // First render after load
  document.addEventListener('DOMContentLoaded', renderMini);
})();


// === Auto Insights filler (fills right column gap) ===
(function(){
  const host = document.getElementById('insights-body');
  if (!host) return;

  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function dKwh(d){ const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1; return (w*h*duty*q)/1000; }

  function renderInsights(){
    const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
    const dim = monthDays();
    const list = (devices||[]).map(d=>{
      const kwhDay = dKwh(d);
      const kwhMon = kwhDay * dim;
      const cost   = kwhMon * rate;
      return {name:d.name||'Device', kwhMon, cost};
    });
    list.sort((a,b)=> b.kwhMon - a.kwhMon);
    const top = list.slice(0,5);

    let html = '';
    if (top.length){
      html += '<div class="mini">Top contributors this month:</div><ul>';
      top.forEach(x=>{
        html += `<li><b>${x.name}</b> — ${x.kwhMon.toFixed(1)} kWh • $${x.cost.toFixed(2)}</li>`;
      });
      html += '</ul>';
    }else{
      html += '<div class="mini">Add devices to see insights here.</div>';
    }

    const totalKwh = list.reduce((s,x)=> s + x.kwhMon, 0);
    const total$   = list.reduce((s,x)=> s + x.cost, 0);
    html += `<div class="mini" style="margin-top:8px">Total (proj): ${totalKwh.toFixed(1)} kWh • $${total$.toFixed(2)}</div>`;

    host.innerHTML = html;
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); renderInsights(); };
  document.addEventListener('DOMContentLoaded', renderInsights);
})();


// === Right-side Breakdown: mirrors main breakdown and fills right column ===
(function(){
  const tbody = document.getElementById('right-comp-rows');
  if (!tbody) return;

  function buildParts(){
    if (typeof currentPartsFiltered === 'function') return currentPartsFiltered();
    if (typeof currentParts === 'function') return currentParts();
    return {labels:[], kwhs:[], shares:[], costs:[], totalK:0, rate:0};
  }

  function renderRightBreakdown(){
    const parts = buildParts();
    tbody.innerHTML = '';
    let total$ = 0;
    (parts.labels||[]).forEach((name,i)=>{
      const tr = document.createElement('tr');
      const kwh = parts.kwhs[i]||0;
      const pct = parts.shares[i]||0;
      const cost= parts.costs[i]||0;
      total$ += cost;
      tr.innerHTML = `<td>${name}</td>
                      <td class="num">${kwh.toFixed(2)}</td>
                      <td class="num">${pct.toFixed(1)}%</td>
                      <td class="num">$${cost.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });
    const tk = document.getElementById('right-tot-kwh');
    const tc = document.getElementById('right-tot-cost');
    if (tk) tk.textContent = (parts.totalK||0).toFixed(2);
    if (tc) tc.textContent = '$'+(total$||0).toFixed(2);
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); renderRightBreakdown(); };
  document.addEventListener('DOMContentLoaded', renderRightBreakdown);
})();


// Toggle compact/expanded tips area based on content
try{
  const aiTipsBox = document.getElementById('ai-tips');
  if (aiTipsBox && !aiTipsBox.dataset._nrgHooked){
    aiTipsBox.dataset._nrgHooked = '1';
    const _aiRender = (arrLen)=>{
      if (!aiTipsBox) return;
      if (arrLen && arrLen > 0){ aiTipsBox.classList.remove('empty'); }
      else{ aiTipsBox.classList.add('empty'); }
    };
    // Hook into existing click handler by monkey-patching innerHTML setter if needed
    const _set = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
    Object.defineProperty(aiTipsBox, 'innerHTML', {
      set(v){ _set.call(aiTipsBox, v); _aiRender((aiTipsBox.querySelectorAll('.ai-tip')||[]).length); }
    });
    // Initial render as empty
    _aiRender(0);
  }
}catch(e){ /* noop */ }


// (old donut patch removed)


// (old donut patch removed)


// (old donut patch removed)


// (old donut patch removed)


// (old donut patch removed)


// (old donut patch removed)


// (old donut patch removed)


// === Donut + Mini Panel Unified Sync (v8) ===
(function(){
  const meter = document.getElementById("donut-meter");
  const cost  = document.getElementById("donut-cost");
  if (!meter || !cost) return;

  const _renderAll = renderAll;
  renderAll = function(){
    _renderAll();
    try {
      const kwhNode  = document.getElementById("mini-kwh");
      const billNode = document.getElementById("mini-bill");
      if (kwhNode) meter.textContent = kwhNode.textContent + " kWh";
      if (billNode) cost.textContent = billNode.textContent;
    } catch(e){
      console.warn("Unified sync error:", e);
    }
  };

  // Run once after full load with slight delay to ensure mini-panel is ready
  window.addEventListener("load", () => setTimeout(() => {
    try {
      const kwhNode  = document.getElementById("mini-kwh");
      const billNode = document.getElementById("mini-bill");
      if (kwhNode) meter.textContent = kwhNode.textContent + " kWh";
      if (billNode) cost.textContent = billNode.textContent;
    } catch(e){}
  }, 200));
})();



// === Quick Add mapping ===
const QUICK_MAP = {
  'router':        {name:'Router',        watts:12,   hoursPerDay:24, duty:100, quantity:1},
  'modem':         {name:'Cable Modem',   watts:9,    hoursPerDay:24, duty:100, quantity:1},
  'wifi-extender': {name:'Wi‑Fi Extender',watts:6,    hoursPerDay:24, duty:100, quantity:1},
  'fridge':        {name:'Fridge',        watts:160,  hoursPerDay:24, duty:35,  quantity:1},
  'tv':            {name:'TV',            watts:120,  hoursPerDay:3,  duty:100, quantity:1},
  'console':       {name:'Game Console',  watts:90,   hoursPerDay:2,  duty:100, quantity:1},
  'soundbar':      {name:'Soundbar',      watts:25,   hoursPerDay:3,  duty:100, quantity:1},
  'settop':        {name:'Set‑top Box',   watts:15,   hoursPerDay:4,  duty:100, quantity:1},
  'stove':         {name:'Electric Stove', watts:2200, hoursPerDay:0.6,duty:70,  quantity:1},
  'microwave':     {name:'Microwave',     watts:1100, hoursPerDay:0.3,duty:100, quantity:1},
  'kettle':        {name:'Kettle',        watts:1800, hoursPerDay:0.2,duty:100, quantity:1},
  'coffee':        {name:'Coffee Maker',  watts:900,  hoursPerDay:0.3,duty:100, quantity:1},
  'toaster':       {name:'Toaster',       watts:1200, hoursPerDay:0.1,duty:100, quantity:1},
  'fan':           {name:'Fan',           watts:45,   hoursPerDay:6,  duty:100, quantity:1},
  'space-heater':  {name:'Space Heater',  watts:1500, hoursPerDay:1.5,duty:50,  quantity:1},
  'dehumidifier':  {name:'Dehumidifier',  watts:300,  hoursPerDay:6,  duty:60,  quantity:1},
  'humidifier':    {name:'Humidifier',    watts:35,   hoursPerDay:8,  duty:100, quantity:1},
  'washer':        {name:'Washer',        watts:500,  hoursPerDay:0.5,duty:25,  quantity:1},
  'dryer':         {name:'Dryer',         watts:2500, hoursPerDay:0.4,duty:50,  quantity:1},
  'laptop':        {name:'Laptop',        watts:60,   hoursPerDay:5,  duty:60,  quantity:1},
  'desktop':       {name:'Desktop PC',    watts:200,  hoursPerDay:4,  duty:100, quantity:1},
  'printer':       {name:'Printer',       watts:30,   hoursPerDay:0.2,duty:10,  quantity:1},
  'led-lamp':      {name:'LED Lamp',      watts:10,   hoursPerDay:5,  duty:100, quantity:1}
};

// === Theme persist ===
(function(){
  const btns = document.querySelectorAll('.theme-btn');
  const root = document.documentElement;
  const status = document.getElementById('theme-status');
  const saved = localStorage.getItem('nrg-theme');
  if(saved){ root.setAttribute('data-theme', saved); status.textContent = 'Theme: '+saved; }
  btns.forEach(b=> b.addEventListener('click', (e)=>{
    e.preventDefault(); e.stopPropagation();
    const t = b.getAttribute('data-theme');
    root.setAttribute('data-theme', t);
    localStorage.setItem('nrg-theme', t);
    status.textContent = 'Theme: '+t;
    renderAll();
  }));
})();

// === State ===
let devices = [];
let donutChart = null;
let barChart = null;

// === Helpers ===
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function daysElapsedThisMonth(d){ const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return Math.max(0, Math.ceil((d-first)/(1000*60*60*24))); }
function dailyKwh(d){ const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1;
  return (w*h*duty*q)/1000; }
function totalDaily(){ return devices.reduce((s,d)=>s+dailyKwh(d),0); }

function themePalette(){
  const t = document.documentElement.getAttribute('data-theme') || 'sunburst';
  const MAP = {
    light:['#000000','#111827','#374151','#dc2626','#2563eb','#000000','#111827','#374151','#000000'],
    dark:['#22d3ee','#f59e0b','#60a5fa','#5eead4','#f97316','#a78bfa','#34d399','#eab308','#22d3ee'],
    ocean:['#00e5ff','#ffe566','#7dd3fc','#a5f3fc','#22d3ee','#38bdf8','#67e8f9','#fef08a','#00e5ff'],
    solar:['#ffd54a','#ff7a00','#fde047','#fb7185','#f97316','#facc15','#22c55e','#f59e0b','#ffd54a'],
    sunburst:['#ffd166','#ff4d7a','#06d6a0','#118ab2','#ffd6a5','#9b5de5','#00bbf9','#f15bb5','#fee440'],
    'high-contrast':['#ffffff','#ffdd00','#00ffff','#ff00ff','#00ff00','#ff8800','#00aaff','#ff0044','#ffffff']
  };
  const src = MAP[t] || MAP.sunburst;
  return (len)=> Array.from({length:len}, (_,i)=> src[i % src.length]);
}

// === Renderers ===
function renderAll(){
  renderSummaryAndTable();
  updateCharts();
}

function currentParts(){
  const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
  const showMode = document.getElementById('show-mode')?.value || 'sofar';
  const now = new Date(), dim = daysInMonth(now), elapsed = Math.min(daysElapsedThisMonth(now), dim);
  const factor = (showMode==='projected') ? dim : elapsed;
  const labels = devices.map(d=>d.name);
  const kwhs   = devices.map(d=> dailyKwh(d) * factor);
  const totalK = kwhs.reduce((a,b)=>a+b,0) || 1;
  const shares = kwhs.map(x=> x/totalK*100);
  const costs  = kwhs.map(k=> k*rate);
  return {labels, kwhs, shares, costs, totalK, rate};
}

function renderSummaryAndTable(){
  const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
  const now = new Date(), dim = daysInMonth(now);
  const daily = totalDaily();
  const monthProj = daily * dim;
  const billProj = monthProj * rate;
  const sd = document.getElementById('sum-daily');
  const sm = document.getElementById('sum-month');
  const sb = document.getElementById('sum-bill');
  if (sd) sd.textContent = daily.toFixed(2);
  if (sm) sm.textContent = monthProj.toFixed(0);
  if (sb) sb.textContent = '$'+billProj.toFixed(2);

  const tbody = document.getElementById('comp-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  const parts = currentParts();
  let tot$=0;
  parts.labels.forEach((name,i)=>{
    const tr = document.createElement('tr');
    const kwh = parts.kwhs[i];
    const pct = parts.shares[i];
    const cost= parts.costs[i];
    tot$ += cost;
    tr.innerHTML = `<td>${name}</td>
                    <td class="num">${kwh.toFixed(2)}</td>
                    <td class="num">${pct.toFixed(1)}%</td>
                    <td class="num">$${cost.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  const tk = document.getElementById('tot-kwh');
  const tc = document.getElementById('tot-cost');
  if (tk) tk.textContent = parts.totalK.toFixed(2);
  if (tc) tc.textContent = '$'+tot$.toFixed(2);
}

function updateCharts(){
  const {labels, shares, kwhs} = currentParts();
  const colors = themePalette()(labels.length);

  // Donut
  const donutCtx = document.getElementById('donut')?.getContext('2d');
  if (donutCtx){
    const data = { labels, datasets:[{ data: shares, backgroundColor: colors, borderColor:'#00000066', borderWidth:1 }] };
    if (!donutChart){
      donutChart = new Chart(donutCtx, { type:'doughnut', data, options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:{duration:0},plugins:{legend:{display:false}},maintainAspectRatio:false,animation:{duration:200}} });
    } else { donutChart.data = data; donutChart.update(); }
  }

  // Bar (kWh)
  const barCtx = document.getElementById('breakdownBar')?.getContext('2d');
  if (barCtx){
    const data = { labels, datasets:[{ label:'kWh', data:kwhs, backgroundColor: colors, borderColor:'#00000066', borderWidth:1 }] };
    if (!barChart){
      barChart = new Chart(barCtx, { type:'bar', data, options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:{duration:0},plugins:{legend:{display:false}},maintainAspectRatio:false,scales:{y:{beginAtZero:true}}} });
    } else { barChart.data = data; barChart.update(); }
  }
}


// === UI Polish: theme-aware chart colors, persistence, toggles ===
// === Extras: Reset, Export PNG/CSV, Save/Load Profile, Suite Filter ===
(function(){
  const id = (x)=>document.getElementById(x);

  // Reset tweaks to defaults
  id('btn-reset')?.addEventListener('click', ()=>{
    const defaults = {barPct:'0.50',catPct:'0.60',cutout:'62',split:'50',pad:'12',lbl:'0'};
    for(const [k,v] of Object.entries(defaults)){
      const el = id(k); if(el){ el.value = v; }
    }
    localStorage.removeItem('nrg-v28-adjust');
    updateCharts();
  });

  // Export charts as PNG
  function downloadURI(uri, name){
    const a = document.createElement('a'); a.href = uri; a.download = name; a.click();
  }
  id('btn-exp-donut')?.addEventListener('click', ()=>{
    const cvs = document.getElementById('donut'); if(!cvs) return;
    downloadURI(cvs.toDataURL('image/png'), 'nrg-donut.png');
  });
  id('btn-exp-bar')?.addEventListener('click', ()=>{
    const cvs = document.getElementById('breakdownBar'); if(!cvs) return;
    downloadURI(cvs.toDataURL('image/png'), 'nrg-bar.png');
  });

  // Export table CSV
  id('btn-exp-csv')?.addEventListener('click', ()=>{
    const rows = [['Device','kWh','% share','$']];
    const parts = currentPartsFiltered();
    parts.labels.forEach((name,i)=>{
      rows.push([name, parts.kwhs[i].toFixed(2), parts.shares[i].toFixed(1)+'%', parts.costs[i].toFixed(2)]);
    });
    rows.push(['TOTAL', parts.totalK.toFixed(2), '100%', (parts.costs.reduce((a,b)=>a+b,0)).toFixed(2)]);
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    downloadURI(url, 'nrg-breakdown.csv');
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  });

  // Save / Load Profile (devices list)
  id('btn-save-prof')?.addEventListener('click', ()=>{
    try{
      const blob = new Blob([JSON.stringify({devices}, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      downloadURI(url, 'nrg-profile.json');
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
    }catch(e){ console.error(e); }
  });
  id('btn-load-prof')?.addEventListener('click', ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = ()=>{
      const f = inp.files?.[0]; if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{
        try{
          const data = JSON.parse(String(r.result||'{}'));
          if(Array.isArray(data.devices)){ devices = data.devices; renderAll(); }
          else if (Array.isArray(data)){ devices = data; renderAll(); }
        }catch(e){ alert('Invalid profile JSON'); }
      };
      r.readAsText(f);
    };
    inp.click();
  });

  // Suite filter: All / Main / Suite
  let FILTER = 'all'; // 'all' | 'main' | 'suite'
  id('filter-all')?.addEventListener('click', ()=>{ FILTER='all'; renderAll(); });
  id('filter-main')?.addEventListener('click', ()=>{ FILTER='main'; renderAll(); });
  id('filter-suite')?.addEventListener('click', ()=>{ FILTER='suite'; renderAll(); });

  // Wrap the parts calc with filter
  window.currentPartsFiltered = function(){
    const raw = currentParts();
    if(FILTER==='all') return raw;
    const isSuite = (name)=>/\(Suite\)\s*$/.test(name);
    const keep = raw.labels.map((name,i)=> ({name,i})).filter(({name})=> FILTER==='suite' ? isSuite(name) : !isSuite(name));
    const labels = keep.map(k=> raw.labels[k.i]);
    const kwhs   = keep.map(k=> raw.kwhs[k.i]);
    const costs  = keep.map(k=> raw.costs[k.i]);
    const totalK = kwhs.reduce((a,b)=>a+b,0) || 1;
    const shares = kwhs.map(x=> x/totalK*100);
    return {labels,kwhs,shares,costs,totalK, rate: raw.rate};
  };

  // Patch renderers to use filtered parts
  const _renderSummaryAndTable = renderSummaryAndTable;
  renderSummaryAndTable = function(){
    // reuse original for summary numbers
    _renderSummaryAndTable();
    // then replace table body with filtered data
    const tbody = document.getElementById('comp-rows'); if (!tbody) return;
    const parts = currentPartsFiltered();
    tbody.innerHTML='';
    let tot$=0;
    parts.labels.forEach((name,i)=>{
      const tr = document.createElement('tr');
      const kwh = parts.kwhs[i];
      const pct = parts.shares[i];
      const cost= parts.costs[i];
      tot$ += cost;
      tr.innerHTML = `<td>${name}</td>
                      <td class="num">${kwh.toFixed(2)}</td>
                      <td class="num">${pct.toFixed(1)}%</td>
                      <td class="num">$${cost.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });
    const tk = document.getElementById('tot-kwh');
    const tc = document.getElementById('tot-cost');
    if (tk) tk.textContent = parts.totalK.toFixed(2);
    if (tc) tc.textContent = '$'+tot$.toFixed(2);
  };

  const _updateCharts = updateCharts;
  updateCharts = function(){
    // Call original to build data structures
    _updateCharts();
    // Then, if charts exist, overwrite their datasets with filtered data and refresh
    if (donutChart || barChart){
      const p = currentPartsFiltered();
      const colors = themePalette()(p.labels.length);
      if (donutChart){
        donutChart.data = { labels: p.labels, datasets:[{ data: p.shares, backgroundColor: colors, borderColor:'#00000033', borderWidth:1 }] };
        donutChart.update();
      }
      if (barChart){
        barChart.data = { labels: p.labels, datasets:[{ label:'kWh', data:p.kwhs, backgroundColor: colors, borderColor:'#00000033', borderWidth:1 }] };
        barChart.update();
      }
    }
  };

})();

function getThemeChartColors(){
  const cs = getComputedStyle(document.documentElement);
  // Use --muted for tick text; derive grid color from input border
  const tick = cs.getPropertyValue('--muted').trim() || '#b3b3b3';
  const inputBr = cs.getPropertyValue('--input-br').trim() || '#3a3a3a';
  // make grid less intense
  const grid = inputBr.replace(/([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, '$1');
  return { tickColor: tick, gridColor: inputBr || '#3a3a3a' };
}

// Persist and restore control sliders
const NRG_STORE_KEY = 'nrg-v28-adjust';
function saveAdjustments(){
  const payload = {
    barPct: document.getElementById('barPct')?.value,
    catPct: document.getElementById('catPct')?.value,
    cutout: document.getElementById('cutout')?.value,
    split: document.getElementById('split')?.value,
    pad: document.getElementById('pad')?.value,
    lbl: document.getElementById('lbl')?.value,
  };
  localStorage.setItem(NRG_STORE_KEY, JSON.stringify(payload));
}
function loadAdjustments(){
  try{
    const raw = localStorage.getItem(NRG_STORE_KEY);
    if(!raw) return;
    const v = JSON.parse(raw);
    for (const [k,val] of Object.entries(v)){
      const el = document.getElementById(k);
      if (el && typeof val !== 'undefined'){ el.value = val; }
    }
  }catch{}
}

// Density toggle
(function(){
  const btn = document.getElementById('density-toggle');
  if(!btn) return;
  const key='nrg-density';
  const root = document.documentElement;
  function apply(state){
    const root = document.documentElement;
    root.classList.toggle('compact', state==='compact');
    root.classList.toggle('comfort', state==='comfort');
    btn.setAttribute('aria-pressed', state==='compact' ? 'true' : 'false');
    btn.textContent = state==='compact' ? 'Comfort' : 'Compact';
    localStorage.setItem(key, state);
    if (typeof renderAll==='function') { try{ renderAll(); }catch(e){} }
  }
  const saved = localStorage.getItem(key) || 'comfort';
  apply(saved);
  btn.addEventListener('click', ()=> apply(document.documentElement.classList.contains('compact') ? 'comfort' : 'compact'));
})();

// Mobile donut/bar toggle
(function(){
  const showDonut = document.getElementById('show-donut');
  const showBar = document.getElementById('show-bar');
  const dw = document.getElementById('donutWrap');
  const bw = document.getElementById('barWrap');
  if (showDonut && showBar && dw && bw){
    showDonut.addEventListener('click', ()=>{ dw.classList.remove('hidden'); bw.classList.add('hidden'); });
    showBar.addEventListener('click', ()=>{ bw.classList.remove('hidden'); dw.classList.add('hidden'); });
  }
})();

// === Seeds ===
function basicFunctionSeed(type, beds){
  const b = parseInt(beds||'1',10)||1;
  const list = [];
  const add = (device)=> list.push({...device, source:'Preset'});
  const fridge = {name:'Fridge', watts:160, hoursPerDay:24, duty:35, quantity:1};
  const microwave = {name:'Microwave', watts:1100, hoursPerDay:0.25, duty:100, quantity:1};
  const stove = {name:'Electric Stove', watts:2200, hoursPerDay:0.6, duty:70, quantity:1};
  const washer = {name:'Washer', watts:500, hoursPerDay:0.5, duty:25, quantity:1};
  const dryer = {name:'Dryer', watts:2500, hoursPerDay:0.4, duty:50, quantity:1};
  const dehumidifier = {name:'Dehumidifier', watts:300, hoursPerDay:6, duty:60, quantity:1};

  // Preset philosophy: seed what usually comes with the dwelling.
  // Personal devices like modem/router/TV/laptop stay in Quick Add.
  // Empty receptacles/outlets are assumed to draw 0 kWh until the user adds devices.
  if (type === 'custom') return list;

  const lightingQty = Math.max(4, Math.min(10, b + 3)); // bedrooms + kitchen + bathroom + living area, with a small practical cap
  const lighting = {name:`Baseline LED Lighting (${lightingQty} fixtures)`, watts:9, hoursPerDay:4, duty:100, quantity:lightingQty};

  add(lighting);
  add(fridge);

  if (type === 'apartment' || type === 'condo'){
    if (b >= 1) add(microwave);
    if (b >= 2) add(stove);
  } else if (type === 'townhouse'){
    add(microwave);
    add(stove);
    add(washer);
    add(dryer);
  } else if (type === 'house'){
    add(microwave);
    add(stove);
    add(washer);
    add(dryer);
    add(dehumidifier);
  }

  return list;
}

// === Wiring ===
function wire(){
  // Apply preset
  const apply = document.getElementById('bf-apply');
  if (apply){
    apply.addEventListener('click', ()=>{
      const type = document.getElementById('bf-type').value;
      const beds = document.getElementById('bf-beds').value;
      const replace = document.getElementById('bf-replace').checked;
      let list = basicFunctionSeed(type, beds);
      if (!replace) list = (devices||[]).concat(list);
      devices = list;
      renderAll();
    });
  }

  // Add custom device
  const addBtn = document.getElementById('add-btn');
  if (addBtn){
    addBtn.addEventListener('click', ()=>{
      const name = (document.getElementById('add-name').value||'').trim() || 'Device';
      const watts= parseFloat(document.getElementById('add-watts').value||'0')||0;
      const hours= parseFloat(document.getElementById('add-hours').value||'0')||0;
      const duty = parseFloat(document.getElementById('add-duty').value||'100')||100;
      const qty  = parseInt(document.getElementById('add-qty').value||'1',10)||1;
      devices.push({ name, watts, hoursPerDay:hours, duty, quantity:qty, source:'Custom' });
      document.getElementById('add-form').reset();
      document.getElementById('add-duty').value=100; document.getElementById('add-qty').value=1;
      renderAll();
    });
  }

  // Show mode toggle
  const show = document.getElementById('show-mode');
  if (show){ show.addEventListener('change', renderAll); }

  // Rate input
  const rate = document.getElementById('grid-rate');
  if (rate){ rate.addEventListener('input', renderAll); }

  // Quick Add
  const qaSel = document.getElementById('qa-select');
  const qaBtn = document.getElementById('qa-add');
  function setQA(){ if (qaBtn) qaBtn.disabled = !(qaSel && qaSel.value && QUICK_MAP[qaSel.value]); }
  if (qaSel){ qaSel.addEventListener('change', setQA); }
  if (qaBtn){
    qaBtn.addEventListener('click', ()=>{
      const key = qaSel.value; if (!key || !QUICK_MAP[key]) return;
      const d = QUICK_MAP[key];
      devices.push({ name:d.name, watts:d.watts, hoursPerDay:d.hoursPerDay, duty:d.duty, quantity:d.quantity, source:'Quick Add' });
      qaSel.value=''; setQA();
      renderAll();
    });
  }
  setQA();
}


// === Sliders for Adjustments ===
function wireSliders(){
  const bt = document.getElementById('bar-thickness');
  const bs = document.getElementById('bar-spacing');
  const dc = document.getElementById('donut-cutout');
  if(bt) bt.addEventListener('input', ()=>{ if(barChart){ barChart.options.datasets = {bar:{barPercentage:parseFloat(bt.value), categoryPercentage:parseFloat(bs.value)}}; barChart.update(); }});
  if(bs) bs.addEventListener('input', ()=>{ if(barChart){ barChart.options.datasets = {bar:{barPercentage:parseFloat(bt.value), categoryPercentage:parseFloat(bs.value)}}; barChart.update(); }});
  if(dc) dc.addEventListener('input', ()=>{ if(donutChart){ donutChart.options.cutout = dc.value+'%'; donutChart.update(); }});
}

// === Init ===
document.addEventListener('DOMContentLoaded', ()=>{
  loadAdjustments();
  wire();
  // Start with a light seed so the page isn't empty
  devices = basicFunctionSeed('apartment', 1);
  renderAll();
  wireSliders();
});
  
// === NRG v29 Preview: Smart Devices (Bridge stub + Demo mode) ===
(function(){
  document.addEventListener('DOMContentLoaded', function(){

  const qs = (s)=>document.querySelector(s);
  const qsa= (s)=>Array.from(document.querySelectorAll(s));
  const modal = qs('#sd-modal');
  const openBtn = qs('#btn-connect');
  const closeBtn= qs('#sd-close');
  const urlInp = qs('#sd-url');
  const statusEl= qs('#sd-status');
  const listEl = qs('#sd-list');
  const adpBtns = qsa('.sd-adp');
  const btnConn = qs('#sd-connect');
  const btnDemo = qs('#sd-demo');
  let ws = null;
  let connected = false;
  let demo = false;

  function openModal(){ modal.style.display='flex'; modal.setAttribute('aria-hidden','false'); }
  function closeModal(){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }
  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);

  function setStatus(msg){ statusEl.textContent = msg; }

  function renderDevices(devs){
    listEl.innerHTML = '';
    devs.forEach(d=>{
      const row = document.createElement('div');
      row.className = 'sd-item';
      row.innerHTML = `
        <div class="sd-name">${d.name}</div>
        <div class="sd-meta">${d.adapter} • ${d.ip || '—'} • ${d.watts!=null? (d.watts+' W'):'—'}</div>
        <button class="nrg-btn sd-btn" data-id="${d.id}" data-action="toggle">${d.on ? 'Turn Off' : 'Turn On'}</button>
        <button class="nrg-btn sd-btn" data-id="${d.id}" data-action="link">Link to Item…</button>
      `;
      listEl.appendChild(row);
    });
    qsa('.sd-btn').forEach(b=> b.addEventListener('click', handleDeviceAction));
  }

  function handleDeviceAction(e){
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action==='toggle'){
      if (demo){
        // flip demo state locally
        const item = DEMO_DEVICES.find(x=>x.id===id);
        if (item){ item.on = !item.on; renderDevices(DEMO_DEVICES); }
      }else if (connected && ws && ws.readyState===1){
        ws.send(JSON.stringify({type:'setState', id, on:'toggle'}));
      }
    } else if (action==='link'){
      const name = prompt('Link this device to which NRG item name? (e.g., TV, Fridge)');
      if (!name) return;
      alert('Linked '+id+' → '+name+' (mapping stored locally)');
      // TODO: persist mapping; for preview we only show confirmation
    }
  }

  // Adapter discovery
  adpBtns.forEach(b=> b.addEventListener('click', ()=>{
    const adp = b.getAttribute('data-adp');
    if (demo){
      const devs = DEMO_DEVICES.filter(x=>x.adapter===adp);
      renderDevices(devs);
    }else if (connected && ws && ws.readyState===1){
      ws.send(JSON.stringify({type:'discover', adapter: adp}));
    }else{
      alert('Connect to a Bridge or use Demo Mode.');
    }
  }));

  // Demo devices
  const DEMO_DEVICES = [
    {id:'kasa:plug:tv',     adapter:'kasa',    name:'Living TV Plug', ip:'192.168.1.51', on:true,  watts: 78},
    {id:'kasa:plug:router', adapter:'kasa',    name:'Router Plug',    ip:'192.168.1.52', on:true,  watts: 12},
    {id:'shelly:sw:lamp',   adapter:'shelly',  name:'Bedroom Lamp',   ip:'192.168.1.61', on:false, watts:  0},
    {id:'tasmota:fan',      adapter:'tasmota', name:'Box Fan',        ip:'192.168.1.71', on:true,  watts: 45},
    {id:'hue:bulb:desk',    adapter:'hue',     name:'Desk Bulb',      ip:'—',            on:false, watts:  7}
  ];

  // Bridge connection
  btnConn?.addEventListener('click', ()=>{
    try{
      demo = false;
      if (ws){ try{ ws.close(); }catch{} }
      const url = (urlInp.value||'').trim();
      ws = new WebSocket(url);
      setStatus('Connecting to '+url+'…');
      ws.onopen = ()=>{ connected=true; setStatus('Connected to Bridge. Choose an adapter to discover.'); };
      ws.onclose= ()=>{ connected=false; setStatus('Disconnected.'); };
      ws.onerror= ()=>{ connected=false; setStatus('Error connecting. Check address or use Demo Mode.'); };
      ws.onmessage = (ev)=>{
        try{
          const msg = JSON.parse(ev.data||'{}');
          if (msg.type==='devices' && Array.isArray(msg.items)){ renderDevices(msg.items); }
          if (msg.type==='state' && msg.id){
            // update a single device state if present
          }
        }catch(e){}
      };
    }catch(e){
      setStatus('Could not open Bridge: '+(e?.message||e));
    }
  });

  // Demo mode
  btnDemo?.addEventListener('click', ()=>{
    demo = true; connected = false;
    setStatus('Demo Mode: using example devices on this page only.');
    renderDevices(DEMO_DEVICES);
  });

  });
})();


// === NRG AI Advisor (Preview): local heuristics for savings tips ===
(function(){
  const $ = (id)=>document.getElementById(id);
  const tipsBox = $('ai-tips');
  const runBtn  = $('ai-run');
  if (!tipsBox || !runBtn) return;

  function fmt$(x){ return '$' + (x||0).toFixed(2); }
  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function deviceKwhMonth(d){
    const dim = monthDays();
    const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1;
    return (w*h*duty*q/1000) * dim;
  }

  function makeTip(title, save, body, tag){
    const div = document.createElement('div');
    div.className = 'ai-tip';
    div.innerHTML = `
      <div class="ai-head">
        <div><span class="ai-title">${title}</span>${tag?`<span class="ai-tag">${tag}</span>`:''}</div>
        <div class="ai-save">${fmt$(save)} / mo</div>
      </div>
      <div class="ai-body">${body}</div>
    `;
    return div;
  }

  function inOffpeak(startH, endH, testH){
    if (startH===endH) return true; // degenerate = full day
    if (startH < endH){
      return testH >= startH && testH < endH;
    }else{
      // window wraps midnight
      return testH >= startH || testH < endH;
    }
  }

  runBtn.addEventListener('click', ()=>{
    const peak = parseFloat($('ai-peak').value||'0.22')||0.22;
    const off  = parseFloat($('ai-off').value||'0.12')||0.12;
    let start = parseInt($('ai-start').value||'22',10); if (isNaN(start)) start=22;
    let end   = parseInt($('ai-end').value||'7',10); if (isNaN(end)) end=7;
    const dim = monthDays();

    if (!Array.isArray(devices) || devices.length===0){
      tipsBox.innerHTML = '<div class="ai-tip"><div class="ai-body">Add some devices first, then click Generate Tips.</div></div>';
      return;
    }

    const out = [];
    const lower = Math.max(0, peak - off);

    // 1) Laundry shift (Washer/Dryer) to off-peak
    const wash = devices.find(d=> /washer/i.test(d.name||''));
    const dry  = devices.find(d=> /dryer/i.test(d.name||''));
    const laundry = [wash, dry].filter(Boolean);
    if (laundry.length){
      const kwh = laundry.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      // assume baseline run occurs at peak; savings = kwh * (peak - off)
      const save = kwh * lower;
      if (save > 0.5){
        out.push(makeTip(
          "Shift laundry to off‑peak ("+start+":00→"+end+":00)",
          save,
          `Washer/Dryer use ~${kwh.toFixed(1)} kWh / month. If you run cycles during your off‑peak window, you avoid the higher rate (Δ=${fmt$(lower)}/kWh).`,
          "schedule"
        ));
      }
    }

    // 2) LED swap suggestion for high‑watt lamps
    const candidates = devices.filter(d=> /(lamp|bulb)/i.test(d.name||'') && (+d.watts||0) >= 40);
    if (candidates.length){
      const kwhOld = candidates.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      // Assume LED @ 10 W, same hours
      const ledCandidates = candidates.map(d=> ({...d, watts:10}));
      const kwhNew = ledCandidates.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const saveKwh = Math.max(0, kwhOld - kwhNew);
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const save = saveKwh * rate;
      if (save > 0.5){
        out.push(makeTip(
          "Swap high‑watt bulbs for LED",
          save,
          `Found ${candidates.length} lamp(s) over 40W. Replacing with 10W LEDs saves ~${saveKwh.toFixed(1)} kWh/month at your current rate (${fmt$(rate)}/kWh).`,
          "hardware"
        ));
      }
    }

    // 3) Phantom loads (always‑on small devices)
    const phantoms = devices.filter(d=> (+d.hoursPerDay)===24 && (+d.watts) >= 5 && (+d.watts) <= 20);
    if (phantoms.length){
      const kwh = phantoms.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const save = kwh * rate * 0.3; // assume 30% cut via smart plug schedules
      if (save > 0.3){
        out.push(makeTip(
          "Tame phantom loads with schedules",
          save,
          `Detected ${phantoms.length} always‑on small device(s). Using smart plugs to cut ~30% runtime could save ~${(kwh*0.3).toFixed(1)} kWh/month.`,
          "automation"
        ));
      }
    }

    // 4) Space heater trim
    const heaters = devices.filter(d=> /space\s*heater/i.test(d.name||''));
    if (heaters.length){
      const kwh = heaters.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const save = kwh * rate * 0.15; // 15% runtime trim
      if (save > 0.5){
        out.push(makeTip(
          "Trim space‑heater runtime by 15%",
          save,
          `Space heaters are costly. Trimming usage by ~15% reduces ~${(kwh*0.15).toFixed(1)} kWh/month without big comfort loss.`,
          "behavior"
        ));
      }
    }

    // 5) AC schedule if present (basic)
    const acs = devices.filter(d=> /(ac|air\s*conditioner)/i.test(d.name||''));
    if (acs.length){
      const kwh = acs.reduce((s,d)=> s + deviceKwhMonth(d), 0);
      const save = kwh * lower * 0.5; // assume half the runtime can be shifted
      if (save > 0.5){
        out.push(makeTip(
          "Pre‑cool / shift AC to off‑peak",
          save,
          `With off‑peak window ${$('ai-start').value}:00→${$('ai-end').value}:00, shifting ~50% of cooling saves the rate difference (Δ=${fmt$(lower)}/kWh).`,
          "schedule"
        ));
      }
    }

    // Render tips
    tipsBox.innerHTML = '';
    if (!out.length){
      tipsBox.innerHTML = '<div class="ai-tip"><div class="ai-body">No obvious savings found with current inputs. Try adding Washer/Dryer, Lamps, or Smart Plugs.</div></div>';
    }else{
      out.forEach(t=> tipsBox.appendChild(t));
    }
  });
})();


// === Mini Devices Panel: stats + quick list ===
(function(){
  const miniCount = document.getElementById('mini-count');
  const miniKwh   = document.getElementById('mini-kwh');
  const miniBill  = document.getElementById('mini-bill');
  const miniList  = document.getElementById('mini-list');

  if (!miniList) return;

  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function dKwh(d){ const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1; return (w*h*duty*q)/1000; }

  function renderMini(){
    try{
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const dim = monthDays();

      const count = (devices||[]).length;
      const daily = (devices||[]).reduce((s,d)=> s + dKwh(d), 0);
      const monthK = daily * dim;
      const bill   = monthK * rate;

      if (miniCount) miniCount.textContent = String(count);
      if (miniKwh)   miniKwh.textContent   = daily.toFixed(2);
      if (miniBill)  miniBill.textContent  = '$' + bill.toFixed(2);

      // Build list rows with clear source, metrics, edit, and remove controls.
      miniList.innerHTML = '';
      const inferSource = (d)=> d.source || (/(baseline|fridge|microwave|stove|washer|dryer|dehumidifier)/i.test(d.name||'') ? 'Preset' : 'User Added');
      (devices||[]).forEach((d, idx)=>{
        const row = document.createElement('div');
        row.className = 'mini-row';
        const watts = +d.watts || 0;
        const hours = +d.hoursPerDay || 0;
        const duty = +d.duty || 100;
        const qty = +d.quantity || 1;
        const monthlyKwh = dKwh(d) * dim;
        const monthlyCost = monthlyKwh * rate;
        const source = inferSource(d);
        row.innerHTML = `
          <div><div class="mini-name">${d.name||'Device'}</div><span class="mini-source">${source}</span></div>
          <div class="mini-meta">${watts} W<br>${hours} h/day</div>
          <div class="mini-meta">Duty ${duty}%<br>Qty ${qty}</div>
          <div class="mini-cost">${monthlyKwh.toFixed(1)} kWh/mo<br>$${monthlyCost.toFixed(2)}/mo</div>
          <button type="button" class="nrg-btn mini-btn mini-edit" data-idx="${idx}" title="Edit this device">Edit</button>
          <button type="button" class="nrg-btn mini-btn mini-remove" data-idx="${idx}" title="Remove this device">Remove</button>
        `;
        row.querySelector('.mini-remove')?.addEventListener('click', (e)=>{
          const i = parseInt(e.currentTarget.getAttribute('data-idx')||'-1', 10);
          if (i>=0 && i < (devices||[]).length){
            devices.splice(i,1);
            renderAll(); // re-render everything including mini panel
          }
        });
        row.querySelector('.mini-edit')?.addEventListener('click', (e)=>{
          const i = parseInt(e.currentTarget.getAttribute('data-idx')||'-1', 10);
          const item = (devices||[])[i];
          if (!item) return;
          const name = prompt('Device name', item.name || 'Device');
          if (name === null) return;
          const wattsVal = prompt('Watts', String(+item.watts || 0));
          if (wattsVal === null) return;
          const hoursVal = prompt('Hours per day', String(+item.hoursPerDay || 0));
          if (hoursVal === null) return;
          const dutyVal = prompt('Duty %', String(+item.duty || 100));
          if (dutyVal === null) return;
          const qtyVal = prompt('Quantity', String(+item.quantity || 1));
          if (qtyVal === null) return;
          item.name = (name || 'Device').trim();
          item.watts = Math.max(0, parseFloat(wattsVal) || 0);
          item.hoursPerDay = Math.max(0, parseFloat(hoursVal) || 0);
          item.duty = Math.max(0, Math.min(100, parseFloat(dutyVal) || 100));
          item.quantity = Math.max(1, parseInt(qtyVal, 10) || 1);
          item.source = item.source || source;
          renderAll();
        });
        miniList.appendChild(row);
      });
    }catch(e){ /* noop */ }
  }

  // Hook renderAll to also refresh the mini panel
  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); renderMini(); };
  // First render after load
  document.addEventListener('DOMContentLoaded', renderMini);
})();


// === Auto Insights filler (fills right column gap) ===
(function(){
  const host = document.getElementById('insights-body');
  if (!host) return;

  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function dKwh(d){ const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1; return (w*h*duty*q)/1000; }

  function renderInsights(){
    const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
    const dim = monthDays();
    const list = (devices||[]).map(d=>{
      const kwhDay = dKwh(d);
      const kwhMon = kwhDay * dim;
      const cost   = kwhMon * rate;
      return {name:d.name||'Device', kwhMon, cost};
    });
    list.sort((a,b)=> b.kwhMon - a.kwhMon);
    const top = list.slice(0,5);

    let html = '';
    if (top.length){
      html += '<div class="mini">Top contributors this month:</div><ul>';
      top.forEach(x=>{
        html += `<li><b>${x.name}</b> — ${x.kwhMon.toFixed(1)} kWh • $${x.cost.toFixed(2)}</li>`;
      });
      html += '</ul>';
    }else{
      html += '<div class="mini">Add devices to see insights here.</div>';
    }

    const totalKwh = list.reduce((s,x)=> s + x.kwhMon, 0);
    const total$   = list.reduce((s,x)=> s + x.cost, 0);
    html += `<div class="mini" style="margin-top:8px">Total (proj): ${totalKwh.toFixed(1)} kWh • $${total$.toFixed(2)}</div>`;

    host.innerHTML = html;
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); renderInsights(); };
  document.addEventListener('DOMContentLoaded', renderInsights);
})();


// === Right-side Breakdown: mirrors main breakdown and fills right column ===
(function(){
  const tbody = document.getElementById('right-comp-rows');
  if (!tbody) return;

  function buildParts(){
    if (typeof currentPartsFiltered === 'function') return currentPartsFiltered();
    if (typeof currentParts === 'function') return currentParts();
    return {labels:[], kwhs:[], shares:[], costs:[], totalK:0, rate:0};
  }

  function renderRightBreakdown(){
    const parts = buildParts();
    tbody.innerHTML = '';
    let total$ = 0;
    (parts.labels||[]).forEach((name,i)=>{
      const tr = document.createElement('tr');
      const kwh = parts.kwhs[i]||0;
      const pct = parts.shares[i]||0;
      const cost= parts.costs[i]||0;
      total$ += cost;
      tr.innerHTML = `<td>${name}</td>
                      <td class="num">${kwh.toFixed(2)}</td>
                      <td class="num">${pct.toFixed(1)}%</td>
                      <td class="num">$${cost.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });
    const tk = document.getElementById('right-tot-kwh');
    const tc = document.getElementById('right-tot-cost');
    if (tk) tk.textContent = (parts.totalK||0).toFixed(2);
    if (tc) tc.textContent = '$'+(total$||0).toFixed(2);
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); renderRightBreakdown(); };
  document.addEventListener('DOMContentLoaded', renderRightBreakdown);
})();



(function(){
  const root = document.documentElement;
  const body = document.body;
  const key  = 'density-mode';
  const btn  = document.getElementById('density-toggle') || document.getElementById('densityToggle');
  let badge  = document.getElementById('mode-badge');

  function ensureBadge(){
    if (!btn) return null;
    if (!badge){
      badge = document.createElement('span');
      badge.id = 'mode-badge';
      btn.insertAdjacentElement('afterend', badge);
    }
    return badge;
  }

  function setMode(state){
    state = (state==='compact') ? 'compact' : 'comfort';
    root.setAttribute('data-density', state);
    root.classList.toggle('compact', state==='compact');
    root.classList.toggle('comfort', state==='comfort');
    body.classList.toggle('compact', state==='compact');
    body.classList.toggle('comfort', state==='comfort');
    localStorage.setItem(key, state);
    updateUI(state);
    if (typeof renderAll==='function'){ try{ renderAll(); }catch(e){} }
  }

  function currentMode(){
    const a = root.getAttribute('data-density');
    if (a) return a;
    if (root.classList.contains('compact') || body.classList.contains('compact')) return 'compact';
    if (root.classList.contains('comfort') || body.classList.contains('comfort')) return 'comfort';
    return localStorage.getItem(key) || 'comfort';
  }

  function updateUI(state){
    const b = ensureBadge();
    if (btn){
      btn.textContent = 'Mode: ' + (state==='compact' ? 'Compact' : 'Comfort');
      btn.setAttribute('aria-pressed', state==='compact' ? 'true' : 'false');
      btn.title = 'Click to switch to ' + (state==='compact' ? 'Comfort' : 'Compact');
    }
    if (b){ b.textContent = state; }
  }

  // Initialize from saved or default
  setMode(localStorage.getItem(key) || 'comfort');

  if (btn){
    btn.addEventListener('click', ()=>{
      setMode(currentMode()==='compact' ? 'comfort' : 'compact');
    });
  }
})();


(function(){
  if (window.__nrgAutoAITipsPatched) return;
  window.__nrgAutoAITipsPatched = true;

  function autoRunTips(){
    try{
      var btn = document.getElementById('ai-run');
      var tips = document.getElementById('ai-tips');
      if(!btn || !tips) return;
      if (Array.isArray(window.devices) && window.devices.length > 0){
        // Trigger the same logic as the "Generate Tips" button
        btn.click();
      } else {
        tips.innerHTML = '<div class="ai-tip"><div class="ai-body">Add some devices to see tips here.</div></div>';
      }
    }catch(e){ /* noop */ }
  }

  function patchRenderAll(){
    try{
      if (typeof window.renderAll === 'function' && !window.__nrgRenderAllWrapped){
        var _renderAll = window.renderAll;
        window.renderAll = function(){
          try { _renderAll.apply(this, arguments); } catch(e){ try{ _renderAll(); }catch(_e){} }
          try { autoRunTips(); } catch(e){}
        };
        window.__nrgRenderAllWrapped = true;
      }
    }catch(e){ /* noop */ }
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Patch as soon as DOM is ready
    patchRenderAll();
    // Also try once shortly after initial paint for pages that fill devices async
    setTimeout(function(){ patchRenderAll(); autoRunTips(); }, 100);
  });

  // Fallback: in case renderAll is defined later
  var tries = 0;
  var iv = setInterval(function(){
    patchRenderAll();
    tries++;
    if (window.__nrgRenderAllWrapped || tries > 30){ clearInterval(iv); autoRunTips(); }
  }, 200);
})();


(function(){
  const $ = (s)=>document.querySelector(s);
  const $$= (s)=>Array.from(document.querySelectorAll(s));

  const ICONS = {'tv':'📺','fridge':'🧊','router':'📡','laptop':'💻','desktop':'🖥️','lamp':'💡','fan':'🌀','dryer':'🧺','washer':'🧼'};
  function showToast(msg){
    let t=document.createElement('div');t.textContent=msg;
    t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--card);color:var(--txt);padding:8px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.4);z-index:9999;";
    document.body.appendChild(t); setTimeout(()=>t.remove(),1500);
  }
  function syncLegend(){
    if (!window.donutChart) return;
    donutChart.options.plugins.legend.onClick=(e,item,legend)=>{
      const idx=item.index; const ci=legend.chart; const meta=ci.getDatasetMeta(0);
      meta.data[idx].hidden=!meta.data[idx].hidden; ci.update();
      if (window.barChart){ const mb=barChart.getDatasetMeta(0); if (mb.data[idx]) mb.data[idx].hidden=meta.data[idx].hidden; barChart.update(); }
      const row=document.querySelectorAll('#comp-rows tr')[idx]; if (row) row.style.opacity = meta.data[idx].hidden?'0.3':'1';
    };
  }
  function addFocusMode(){
    if (document.getElementById('focus-mode')) return;
    const btn=document.createElement('button'); btn.textContent="🔍 Focus"; btn.className="nrg-btn"; btn.id="focus-mode";
    (document.querySelector('.extra-tools')||document.querySelector('.tr-head'))?.appendChild(btn);
    btn.addEventListener('click', ()=>{ document.body.classList.toggle('focus-mode'); donutChart?.update(); barChart?.update(); });
    const css=document.createElement('style'); css.textContent="body.focus-mode #donut{transform:scale(1.1);} body.focus-mode .big{font-size:22px;}";
    document.head.appendChild(css);
  }
  function addKeyboardShortcuts(){
    document.addEventListener('keydown', (e)=>{
      if (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
      switch(e.key.toLowerCase()){
        case 'a': document.getElementById('add-name')?.focus(); break;
        case 's': document.getElementById('btn-save-prof')?.click(); break;
        case 'l': document.getElementById('btn-load-prof')?.click(); break;
        case 'd': document.getElementById('show-bar')?.click(); break;
        case 'c': document.getElementById('density-toggle')?.click(); break;
        case '?': alert('Shortcuts:\\nA=Add Custom, S=Save Profile, L=Load, D=Toggle Donut/Bar, C=Compact/Comfort'); break;
      }
    });
  }
  function addBundleExport(){
    if (document.getElementById('btn-exp-bundle')) return;
    const btn=document.createElement('button'); btn.textContent="Bundle Export"; btn.className="nrg-btn"; btn.id="btn-exp-bundle";
    document.querySelector('.extra-tools')?.appendChild(btn);
    btn.addEventListener('click', async ()=>{
      try{
        const canvases=[document.getElementById('donut'), document.getElementById('breakdownBar')];
        canvases.forEach(c=>c.toDataURL("image/png"));
        document.getElementById('btn-exp-csv')?.click();
        showToast("Bundle Export triggered");
      }catch(e){ alert("Export failed: "+e); }
    });
  }
  function upgradeMiniIcons(){
    const mini=document.getElementById('mini-list'); if (!mini) return;
    const obs=new MutationObserver(()=>{
      mini.querySelectorAll('.mini-row .mini-name').forEach(el=>{
        if (el.__iconDone) return; el.__iconDone=true;
        const name=(el.textContent||'').toLowerCase();
        for (let k in ICONS){ if (name.includes(k)){ el.textContent = ICONS[k]+' '+el.textContent; break; } }
      });
    }); obs.observe(mini,{childList:true,subtree:true});
  }
  function hook(){
    if (window.__nrgPolishReHook || typeof window.renderAll!=='function') return;
    window.__nrgPolishReHook=true;
    const _renderAll=window.renderAll;
    window.renderAll=function(){ _renderAll(); syncLegend(); addFocusMode(); addKeyboardShortcuts(); addBundleExport(); upgradeMiniIcons(); };
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    let tries=0; const iv=setInterval(()=>{hook(); tries++; if(tries>20) clearInterval(iv);}, 200);
  });
})();


(function(){
  function stepper(hostInput, min=0, max=Infinity, step=1){
    if (!hostInput || hostInput.__stepped) return;
    hostInput.__stepped = true;
    const wrap = document.createElement('div');
    wrap.className = 'nrg-stepper';
    const dec = document.createElement('button'); dec.type='button'; dec.textContent = '–';
    const inc = document.createElement('button'); inc.type='button'; inc.textContent = '+';
    const inp = document.createElement('input'); inp.type='number'; inp.step=String(step); inp.min=min; inp.max=max;
    inp.value = hostInput.value || '';
    hostInput.parentElement.insertBefore(wrap, hostInput);
    wrap.appendChild(dec); wrap.appendChild(inp); wrap.appendChild(inc);
    function syncBack(){ hostInput.value = inp.value; hostInput.dispatchEvent(new Event('change',{bubbles:true})); }
    dec.addEventListener('click', ()=>{ const v=parseFloat(inp.value||'0')||0; const n=Math.max(min, v-(+step)); inp.value = String(n); syncBack(); });
    inc.addEventListener('click', ()=>{ const v=parseFloat(inp.value||'0')||0; const n=Math.min(max, v+(+step)); inp.value = String(n); syncBack(); });
    inp.addEventListener('change', syncBack);
  }
  function attachAddFormSteppers(){
    const w = document.getElementById('add-watts');
    const h = document.getElementById('add-hours');
    if (w) stepper(w, 0, 10000, 10);
    if (h) stepper(h, 0, 24, 0.25);
  }
  function attachMiniSteppers(){
    const mini = document.getElementById('mini-list');
    if (!mini || mini.__stepObs) return;
    mini.__stepObs = true;
    const obs = new MutationObserver(()=>{
      mini.querySelectorAll('.qe-w:not(.__stepped)').forEach(el=>{
        const wrap = document.createElement('div');
        wrap.className = 'nrg-stepper';
        const dec = document.createElement('button'); dec.type='button'; dec.textContent='–';
        const inc = document.createElement('button'); inc.type='button'; inc.textContent='+';
        const inp = document.createElement('input'); inp.type='number'; inp.step='10'; inp.min='0'; inp.value = el.value || '';
        el.style.display='none';
        el.parentElement.appendChild(wrap);
        wrap.appendChild(dec); wrap.appendChild(inp); wrap.appendChild(inc);
        function syncBack(){ el.value = inp.value; el.dispatchEvent(new Event('change',{bubbles:true})); }
        dec.addEventListener('click', ()=>{ const v=parseFloat(inp.value||'0')||0; inp.value = String(Math.max(0, v-10)); syncBack(); });
        inc.addEventListener('click', ()=>{ const v=parseFloat(inp.value||'0')||0; inp.value = String(v+10); syncBack(); });
        inp.addEventListener('change', syncBack);
        el.classList.add('__stepped');
      });
      mini.querySelectorAll('.qe-h:not(.__stepped)').forEach(el=>{
        const wrap = document.createElement('div');
        wrap.className = 'nrg-stepper';
        const dec = document.createElement('button'); dec.type='button'; dec.textContent='–';
        const inc = document.createElement('button'); inc.type='button'; inc.textContent='+';
        const inp = document.createElement('input'); inp.type='number'; inp.step='0.25'; inp.min='0'; inp.max='24'; inp.value = el.value || '';
        el.style.display='none';
        el.parentElement.appendChild(wrap);
        wrap.appendChild(dec); wrap.appendChild(inp); wrap.appendChild(inc);
        function syncBack(){ el.value = inp.value; el.dispatchEvent(new Event('change',{bubbles:true})); }
        dec.addEventListener('click', ()=>{ const v=parseFloat(inp.value||'0')||0; inp.value = String(Math.max(0, v-0.25)); syncBack(); });
        inc.addEventListener('click', ()=>{ const v=parseFloat(inp.value||'0')||0; inp.value = String(Math.min(24, v+0.25)); syncBack(); });
        inp.addEventListener('change', syncBack);
        el.classList.add('__stepped');
      });
    });
    obs.observe(mini, {childList:true, subtree:true});
  }
  function renderTopContributors(){
    const host = document.getElementById('tc-body');
    if (!host) return;
    try{
      let labels=[], kwhs=[];
      if (typeof currentPartsFiltered === 'function'){ const p = currentPartsFiltered(); labels=p.labels||[]; kwhs=p.kwhs||[]; }
      else if (typeof currentParts === 'function'){ const p = currentParts(); labels=p.labels||[]; kwhs=p.kwhs||[]; }
      const pairs = labels.map((n,i)=>({name:n, k:+(kwhs[i]||0)})).filter(x=>x.k>0);
      pairs.sort((a,b)=> b.k - a.k);
      const top = pairs.slice(0,3);
      const max = top[0]?.k || 1;
      host.innerHTML = '';
      if (!top.length){ host.innerHTML = '<div class="tc-meta">Add devices to see contributors.</div>'; return; }
      top.forEach(x=>{
        const row = document.createElement('div');
        row.className = 'tc-row';
        const name = document.createElement('div'); name.textContent = x.name;
        const val  = document.createElement('div'); val.className='tc-meta'; val.textContent = x.k.toFixed(2)+' kWh';
        const bar  = document.createElement('div'); bar.className='tc-bar'; bar.style.setProperty('--tcw', (x.k/max*100).toFixed(1)+'%');
        row.appendChild(name); row.appendChild(val);
        host.appendChild(row);
        host.appendChild(bar);
      });
    }catch(e){}
  }
  function hook(){
    if (window.__nrgCompactV2Hook || typeof window.renderAll!=='function') return;
    window.__nrgCompactV2Hook = true;
    const _renderAll = window.renderAll;
    window.renderAll = function(){
      _renderAll();
      attachAddFormSteppers();
      attachMiniSteppers();
      renderTopContributors();
    };
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    let tries=0; const iv=setInterval(()=>{ hook(); tries++; if(tries>25) clearInterval(iv); }, 160);
  });
})();


(function(){
  function registerDonutPlugin(){
    if (!window.Chart) return;
    if (!window.__nrgDonutLabelPlugin){
      window.__nrgDonutLabelPlugin = {
        id: 'nrgDonutLabels',
        afterDatasetsDraw(chart, args, opts){
          if (!chart || chart.config?.type !== 'doughnut') return;
          const ds = chart.config.data?.datasets?.[0];
          const meta = chart.getDatasetMeta(0);
          if (!ds || !meta || !meta.data) return;
          const data = (ds.data||[]).map(v=>+v||0);
          const sum = data.reduce((a,b)=>a+b,0);
          if (!sum) return;
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
          const color = getComputedStyle(document.documentElement).getPropertyValue('--txt') || '#fff';
          ctx.fillStyle = color || '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          meta.data.forEach((arc, i)=>{
            const val = data[i]||0; if (!val) return;
            const pct = val/sum*100;
            if (pct < 4) return; // skip tiny slices to avoid clutter
            const pos = arc.tooltipPosition();
            ctx.fillText(pct.toFixed(0)+'%', pos.x, pos.y);
          });
          ctx.restore();
        }
      };
    }
    if (!Chart.registry.plugins.get('nrgDonutLabels')){
      Chart.register(window.__nrgDonutLabelPlugin);
    }
  }

  function ensureAfterRender(){
    if (typeof window.renderAll !== 'function') return;
    if (window.__nrgDonutLabelHooked) return;
    window.__nrgDonutLabelHooked = true;
    const _renderAll = window.renderAll;
    window.renderAll = function(){
      _renderAll();
      try {
        registerDonutPlugin();
        if (window.donutChart) { window.donutChart.update(); }
      } catch (e) {}
    };
  }

  document.addEventListener('DOMContentLoaded', function(){
    let tries = 0;
    const iv = setInterval(function(){
      registerDonutPlugin();
      ensureAfterRender();
      tries++;
      if (tries > 30) clearInterval(iv);
    }, 150);
  });
})();


(function(){
  function gridColorForTheme(theme){
    const darks = ["dark","ocean","sunburst","high-contrast"];
    if (darks.includes(theme)){
      return (theme === "high-contrast") ? "#ffffff" : "#00ffff"; // white for HC, cyan otherwise
    } else {
      return "#000000"; // black on light backgrounds (can look deep gray depending on opacity)
    }
  }
  function applyGridColors(){
    try{
      const theme = document.documentElement.getAttribute("data-theme") || "light";
      const barCanvas = document.getElementById("breakdownBar");
      if (!barCanvas || typeof Chart === "undefined" || !Chart.getChart) return;
      const chart = Chart.getChart(barCanvas);
      if (!chart || !chart.options || !chart.options.scales) return;
      const color = gridColorForTheme(theme);
      ["x","y"].forEach(axis => {
        if (chart.options.scales[axis] && chart.options.scales[axis].grid){
          chart.options.scales[axis].grid.color = color;
          chart.options.scales[axis].grid.lineWidth = 1.4;
          // Ensure gridlines are shown
          chart.options.scales[axis].grid.display = true;
        }
      });
      chart.update("none");
    }catch(e){ /* noop */ }
  }
  document.addEventListener("DOMContentLoaded", function(){
    // Apply after charts initialize
    setTimeout(applyGridColors, 120);
    // Re-apply on theme changes
    const obs = new MutationObserver(function(muts){
      for (const m of muts){
        if (m.type === "attributes" && m.attributeName === "data-theme"){
          applyGridColors();
        }
      }
    });
    obs.observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
    // Also re-apply when density mode or controls might reflow charts
    window.addEventListener("resize", applyGridColors);
  });
})();


(function(){
  function gridColorFromCSS(){
    try{
      const s = getComputedStyle(document.documentElement);
      const c = s.getPropertyValue('--gridline').trim();
      return c || 'rgba(255,255,255,0.35)';
    }catch(e){
      return 'rgba(255,255,255,0.35)';
    }
  }
  const ThemeGridlines = {
    id: 'themeGridlines',
    beforeUpdate(chart){
      const color = gridColorFromCSS();
      const scales = chart.scales || {};
      for (const key in scales){
        const sc = scales[key];
        if (!sc || !sc.options || !sc.options.grid) continue;
        sc.options.grid.color = color;
        sc.options.grid.lineWidth = 0.6;
        sc.options.grid.drawBorder = true;
        sc.options.grid.tickLength = 2;
      }
    }
  };
  if (window.Chart && typeof window.Chart.register === 'function'){
    Chart.register(ThemeGridlines);
    const rerender = () => {
      ['donut','breakdownBar'].forEach(id=>{
        const el = document.getElementById(id);
        const ch = el && Chart.getChart ? Chart.getChart(el) : null;
        if (ch) { try{ ch.update(); }catch(e){} }
      });
    };
    // repaint on theme changes
    new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('load', rerender);
  }
})();


(function(){
  // -------- Persistence for theme, density, and chart sliders --------
  const KEY = 'nrg_prefs_v1';
  function loadPrefs(){
    try{ return JSON.parse(localStorage.getItem(KEY) || '{}'); }catch(e){ return {}; }
  }
  function savePrefs(p){
    try{
      const cur = loadPrefs();
      localStorage.setItem(KEY, JSON.stringify(Object.assign({}, cur, p)));
    }catch(e){ /* ignore */ }
  }

  function applyTheme(theme){
    if (!theme) return;
    document.documentElement.setAttribute('data-theme', theme);
    const s1 = document.getElementById('theme-status');
    const s2 = document.getElementById('theme-status2');
    if (s1) s1.textContent = 'Theme: ' + theme;
    if (s2) s2.textContent = 'Theme: ' + theme;
  }
  function applyDensity(mode){
    if (!mode) return;
    document.documentElement.classList.remove('comfort','compact');
    document.body.classList.remove('comfort','compact');
    document.documentElement.classList.add(mode);
    document.body.classList.add(mode);
    const badge = document.getElementById('mode-badge');
    if (badge) badge.textContent = mode;
    const btn = document.getElementById('density-toggle');
    if (btn) btn.textContent = (mode==='compact' ? 'Comfort' : 'Compact');
    btn?.setAttribute('aria-pressed', String(mode==='compact'));
  }
  function applySliders(vals){
    if (!vals) return;
    const bt = document.getElementById('bar-thickness');
    const bs = document.getElementById('bar-spacing');
    const dc = document.getElementById('donut-cutout');
    if (bt && vals.bt != null) bt.value = vals.bt;
    if (bs && vals.bs != null) bs.value = vals.bs;
    if (dc && vals.dc != null) dc.value = vals.dc;
    // If chart instances exist, try to update them using the controls' existing listeners
    try{
      bt?.dispatchEvent(new Event('input',{bubbles:true}));
      bs?.dispatchEvent(new Event('input',{bubbles:true}));
      dc?.dispatchEvent(new Event('input',{bubbles:true}));
    }catch(e){}
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Load + apply prefs on startup
    const P = loadPrefs();
    if (P.theme) applyTheme(P.theme);
    if (P.density) applyDensity(P.density);
    if (P.sliders) applySliders(P.sliders);

    // Hook theme buttons
    document.querySelectorAll('.theme-btn[data-theme]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const t = e.currentTarget.getAttribute('data-theme');
        savePrefs({theme:t});
      }, {capture:true}); // capture to persist even if other handlers stop propagation
    });

    // Hook density toggle
    const dBtn = document.getElementById('density-toggle');
    if (dBtn){
      dBtn.addEventListener('click', ()=>{
        // Inspect current mode from badge or class
        const badge = document.getElementById('mode-badge');
        const cur = (badge?.textContent||'comfort').trim();
        const next = (cur === 'compact') ? 'comfort' : 'compact';
        savePrefs({density: next});
      }, {capture:true});
    }

    // Hook chart sliders
    const bt = document.getElementById('bar-thickness');
    const bs = document.getElementById('bar-spacing');
    const dc = document.getElementById('donut-cutout');
    const store = ()=> savePrefs({sliders:{
      bt: bt ? bt.value : undefined,
      bs: bs ? bs.value : undefined,
      dc: dc ? dc.value : undefined
    }});
    bt?.addEventListener('input', store);
    bs?.addEventListener('input', store);
    dc?.addEventListener('input', store);
  });

  // -------- Legend percentages for the donut (doughnut) --------
  // A plugin that overrides legend labels & tooltips for doughnut/pie charts to append percentage
  const DonutLegendPercent = {
    id: 'donutLegendPercent',
    beforeInit(chart, args, opts){
      if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;
      // Inject tooltip callback if not present
      chart.options.plugins = chart.options.plugins || {};
      chart.options.plugins.tooltip = chart.options.plugins.tooltip || {};
      const tip = chart.options.plugins.tooltip;
      const origLabel = tip.callbacks && tip.callbacks.label;
      tip.callbacks = tip.callbacks || {};
      tip.callbacks.label = function(ctx){
        const ds = ctx.dataset;
        const data = (ds && ds.data) ? ds.data : [];
        const total = data.reduce((a,b)=> a + (typeof b==='number'? b : (+b||0)), 0) || 0;
        const val = typeof ctx.parsed === 'number' ? ctx.parsed : (+ctx.parsed||0);
        const pct = total ? (val/total*100) : 0;
        const base = (origLabel ? origLabel(ctx) : `${ctx.label}: ${val}`);
        // Ensure base is string
        const s = Array.isArray(base) ? base.join(' ') : String(base);
        return `${s} (${pct.toFixed(1)}%)`;
      };

      // Override legend label generator
      chart.options.plugins.legend = chart.options.plugins.legend || {};
      const origGen = chart.options.plugins.legend.labels && chart.options.plugins.legend.labels.generateLabels;
      chart.options.plugins.legend.labels = chart.options.plugins.legend.labels || {};
      chart.options.plugins.legend.labels.generateLabels = function(ch){
        const labels = (origGen ? origGen(ch) : Chart.defaults.plugins.legend.labels.generateLabels(ch));
        try{
          // Compute total from first visible dataset
          const ds = ch.data.datasets && ch.data.datasets[0];
          const data = (ds && ds.data) ? ds.data : [];
          const total = data.reduce((a,b)=> a + (typeof b==='number'? b : (+b||0)), 0) || 0;
          labels.forEach((lbl, i)=>{
            const v = typeof data[i] === 'number' ? data[i] : (+data[i]||0);
            const pct = total ? (v/total*100) : 0;
            // Append percentage to label text
            lbl.text = `${lbl.text} — ${pct.toFixed(1)}%`;
          });
          return labels;
        }catch(e){
          return labels;
        }
      };
    }
  };

  if (window.Chart && typeof window.Chart.register === 'function'){
    Chart.register(DonutLegendPercent);
    // If donut already exists by the time we register, try to update it
    window.addEventListener('load', function(){
      const cv = document.getElementById('donut');
      const ch = cv && Chart.getChart ? Chart.getChart(cv) : null;
      if (ch && (ch.config.type==='doughnut' || ch.config.type==='pie')){
        try{ ch.update(); }catch(e){}
      }
    });
  }
})();


(function(){
  function showInitialFocus(){
    // Prefer a dedicated button if present, else fallback to density toggle
    var el = document.querySelector('[data-autofocus]') || document.getElementById('density-toggle');
    if (!el) return;
    // Add a safe, non-overlaying ring class
    el.classList.add('is-initial-focus');
    // Try to move programmatic focus for accessibility without scrolling
    try{ el.setAttribute('tabindex','0'); el.focus({preventScroll:true}); }catch(e){}

    // Remove the hint on first real interaction
    function clear(){
      el.classList.remove('is-initial-focus');
      window.removeEventListener('pointerdown', clear, {once:true});
      window.removeEventListener('keydown', clear, {once:true});
    }
    window.addEventListener('pointerdown', clear, {once:true});
    window.addEventListener('keydown', clear, {once:true});

    // Safety timeout to auto-clear after a few seconds
    setTimeout(clear, 4000);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', showInitialFocus);
  } else {
    showInitialFocus();
  }
})();


// === Advanced Chart Controls: live labels + details accessibility (v32) ===
(function(){
  const qs = (s)=>document.querySelector(s);
  const $bt = qs('#bar-thickness');
  const $bs = qs('#bar-spacing');
  const $dc = qs('#donut-cutout');
  const $btv= qs('#bar-thickness-val');
  const $bsv= qs('#bar-spacing-val');
  const $dcv= qs('#donut-cutout-val');
  const $det = qs('#adv-toggle');

  function setVal(el, out, fmt){
    if (!el || !out) return;
    let v = parseFloat(el.value);
    if (isNaN(v)) v = 0;
    if (fmt === 'pct') { out.textContent = Math.round(v) + '%'; }
    else { out.textContent = v.toFixed(2); }
  }

  function init(){
    setVal($bt, $btv);
    setVal($bs, $bsv);
    setVal($dc, $dcv, 'pct');
  }

  ['input','change'].forEach(evt=>{
    $bt && $bt.addEventListener(evt, ()=> setVal($bt,$btv));
    $bs && $bs.addEventListener(evt, ()=> setVal($bs,$bsv));
    $dc && $dc.addEventListener(evt, ()=> setVal($dc,$dcv,'pct'));
  });

  // Details aria-expanded sync
  if ($det){
    $det.addEventListener('toggle', ()=>{
      $det.querySelector('summary')?.setAttribute('aria-expanded', $det.open ? 'true' : 'false');
    });
  }

  // Auto-collapse on very small screens to reduce clutter
  if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches){
    const d = document.getElementById('adv-toggle');
    if (d) d.open = false;
  }

  // Run once after content is ready
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* NRG v32 — Micro JS enhancements (append-only, safe) */
document.addEventListener('DOMContentLoaded', () => {
  // 1) Reflect density state in badge text automatically (works with your existing toggle)
  const badge = document.getElementById('mode-badge');
  const setBadge = () => {
    const compact = document.documentElement.classList.contains('compact') || document.body.classList.contains('compact') || document.documentElement.getAttribute('data-density') === 'compact';
    badge && (badge.textContent = compact ? 'compact' : 'comfort');
  };
  setBadge();
  const mo = new MutationObserver(setBadge);
  mo.observe(document.documentElement, { attributes:true, attributeFilter:['class','data-density'] });
  mo.observe(document.body, { attributes:true, attributeFilter:['class'] });

  // 2) First actionable element gets a gentle focus cue for keyboard users only
  const firstBtn = document.querySelector('#theme-toolbar .nrg-btn, .nrg-btn');
  function keyboardPrimed(e){ if(e.key === 'Tab'){ firstBtn?.classList.add('is-initial-focus'); window.removeEventListener('keydown', keyboardPrimed); } }
  window.addEventListener('keydown', keyboardPrimed, { once:true });

  // 3) Keep Advanced controls summary ARIA state in sync
  const adv = document.getElementById('adv-toggle');
  const sum = adv?.querySelector('summary');
  if (adv && sum){
    const sync = () => sum.setAttribute('aria-expanded', adv.open ? 'true' : 'false');
    adv.addEventListener('toggle', sync); sync();
  }
});


(function(){
  const meter = document.getElementById('donut-meter');
  const modeSel = document.getElementById('meter-mode');
  const donutWrap = document.querySelector('.donut-wrap');
  if (!meter || !modeSel || !donutWrap) return;

  modeSel.addEventListener('change', ()=>{
    meter.className = modeSel.value;
    if (modeSel.value === 'digital'){
      updateDigital();
    } else {
      meter.textContent = '';
    }
  });

  function updateDigital(){
    try{
      const daily = (devices||[]).reduce((s,d)=>{
        const w=+d.watts||0, h=+d.hoursPerDay||0;
        const duty=(+d.duty||100)/100, q=+d.quantity||1;
        return s+(w*h*duty*q)/1000;
      },0);
      meter.textContent = daily.toFixed(2)+" kWh";
    }catch(e){}
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  const cutout = document.getElementById('donut-cutout');
  if (cutout){
    cutout.addEventListener('input', ()=>{
      const val = +cutout.value;
      meter.style.display = (val < 70) ? 'block' : 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);
    meter.textContent = daily.toFixed(2)+" kWh";
    meter.classList.add('visible');
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    let text = "";
    if (rate > 0){
      const cost = daily * rate;
      text = "$" + cost.toFixed(2) + " /day";
    } else {
      text = daily.toFixed(2) + " kWh/day";
    }
    meter.textContent = text;
    meter.classList.add('visible');

    // Update Daily Summary card (left panel)
    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.textContent = daily.toFixed(2) + " kWh/day @ $" + rate.toFixed(2) + "/kWh = $" + cost.toFixed(2);
      } else {
        dailyBox.textContent = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('ratePerKwh');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    let text = "";
    if (rate > 0){
      const cost = daily * rate;
      text = "$" + cost.toFixed(2) + " /day";
    } else {
      text = daily.toFixed(2) + " kWh/day";
    }
    meter.textContent = text;
    meter.classList.add('visible');

    // Update Daily Summary card
    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.textContent = daily.toFixed(2) + " kWh/day @ $" + rate.toFixed(2) + "/kWh = $" + cost.toFixed(2);
      } else {
        dailyBox.textContent = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  // Listen to rate input changes
  const rateInput = document.getElementById('ratePerKwh');
  if (rateInput){
    rateInput.addEventListener('input', updateDigital);
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('ratePerKwh');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    if (rate > 0){
      const cost = daily * rate;
      meter.textContent = "$" + cost.toFixed(2) + " /day";
    } else {
      meter.textContent = daily.toFixed(2) + " kWh/day";
    }
    meter.classList.add('visible');

    // Update Daily Summary card
    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.textContent = daily.toFixed(2) + " kWh/day @ $" + rate.toFixed(2) + "/kWh = $" + cost.toFixed(2);
      } else {
        dailyBox.textContent = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  // Listen to rate input changes (both input and change events)
  const rateInput = document.getElementById('ratePerKwh');
  if (rateInput){
    rateInput.addEventListener('input', updateDigital);
    rateInput.addEventListener('change', updateDigital);
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('ratePerKwh');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    if (rate > 0){
      const cost = daily * rate;
      meter.textContent = "$" + cost.toFixed(2) + " /day";
    } else {
      meter.textContent = daily.toFixed(2) + " kWh/day";
    }
    meter.classList.add('visible');

    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.textContent = daily.toFixed(2) + " kWh/day @ $" + rate.toFixed(2) + "/kWh = $" + cost.toFixed(2);
      } else {
        dailyBox.textContent = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  // Hook into renderAll so meter always follows charts
  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  // Fallback: poll ratePerKwh for changes every second
  setInterval(updateDigital, 1000);

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('grid-rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    let text = "";
    if (rate > 0){
      const cost = daily * rate;
      text = daily.toFixed(2) + " kWh/day = $" + cost.toFixed(2);
    } else {
      text = daily.toFixed(2) + " kWh/day";
    }
    meter.textContent = text;
    meter.classList.add('visible');

    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.textContent = daily.toFixed(2) + " kWh/day @ $" + rate.toFixed(2) + "/kWh = $" + cost.toFixed(2);
      } else {
        dailyBox.textContent = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  // Hook into renderAll so meter always follows charts
  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  // Listen to grid-rate input changes (both input and change)
  const rateInput = document.getElementById('grid-rate');
  if (rateInput){
    rateInput.addEventListener('input', updateDigital);
    rateInput.addEventListener('change', updateDigital);
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('grid-rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    if (rate > 0){
      const cost = daily * rate;
      meter.innerHTML = daily.toFixed(2) + " kWh/day<br>$" + cost.toFixed(2) + " /day";
    } else {
      meter.textContent = daily.toFixed(2) + " kWh/day";
    }
    meter.classList.add('visible');

    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.textContent = daily.toFixed(2) + " kWh/day @ $" + rate.toFixed(2) + "/kWh = $" + cost.toFixed(2);
      } else {
        dailyBox.textContent = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  // Hook into renderAll so meter always follows charts
  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  // Listen to grid-rate changes
  const rateInput = document.getElementById('grid-rate');
  if (rateInput){
    rateInput.addEventListener('input', updateDigital);
    rateInput.addEventListener('change', updateDigital);
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('grid-rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    if (rate > 0){
      const cost = daily * rate;
      meter.innerHTML = daily.toFixed(2) + " kWh/day<br>$" + cost.toFixed(2) + " /day";
    } else {
      meter.innerHTML = daily.toFixed(2) + " kWh/day";
    }
    meter.classList.add('visible');

    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.innerHTML = daily.toFixed(2) + " kWh/day<br>$" + cost.toFixed(2) + " /day";
      } else {
        dailyBox.innerHTML = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  // Hook into renderAll so meter always follows charts
  const _renderAll = renderAll;
  renderAll = function(){ _renderAll(); updateDigital(); };

  // Listen to grid-rate changes
  const rateInput = document.getElementById('grid-rate');
  if (rateInput){
    rateInput.addEventListener('input', updateDigital);
    rateInput.addEventListener('change', updateDigital);
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


(function(){
  function updateDigital(){
    const meter = document.getElementById('donut-meter');
    if (!meter) return;
    const rateInput = document.getElementById('grid-rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;

    const daily = (devices||[]).reduce((s,d)=>{
      const w=+d.watts||0, h=+d.hoursPerDay||0;
      const duty=(+d.duty||100)/100, q=+d.quantity||1;
      return s+(w*h*duty*q)/1000;
    },0);

    if (rate > 0){
      const cost = daily * rate;
      meter.innerHTML = daily.toFixed(2) + " kWh/day<br>$" + cost.toFixed(2) + " /day";
    } else {
      meter.innerHTML = daily.toFixed(2) + " kWh/day";
    }
    meter.classList.add('visible');

    const dailyBox = document.querySelector('#daily-kwh-summary');
    if (dailyBox){
      if (rate > 0){
        const cost = daily * rate;
        dailyBox.innerHTML = daily.toFixed(2) + " kWh/day<br>$" + cost.toFixed(2) + " /day";
      } else {
        dailyBox.innerHTML = daily.toFixed(2) + " kWh/day";
      }
    }
  }

  // Hook into renderAll so meter always wins last
  const _renderAll = renderAll;
  renderAll = function(){
    _renderAll();
    setTimeout(updateDigital, 0); // ensure runs after all other updates
  };

  // Listen to grid-rate changes
  const rateInput = document.getElementById('grid-rate');
  if (rateInput){
    rateInput.addEventListener('input', updateDigital);
    rateInput.addEventListener('change', updateDigital);
  }

  document.addEventListener('DOMContentLoaded', updateDigital);
})();


// NRG v27.4 — Smart Chart Empty-State / Bar Softening
(function(){
  function deviceCount(){
    try { return Array.isArray(devices) ? devices.length : 0; } catch(e){ return 0; }
  }
  function ensureBarStateNode(){
    const wrap = document.querySelector('.bargrid-wrap');
    if (!wrap) return null;
    let node = wrap.querySelector('.chart-empty-state');
    if (!node){
      node = document.createElement('div');
      node.className = 'chart-empty-state';
      wrap.appendChild(node);
    }
    return node;
  }
  function updateSmartChartState(){
    const wrap = document.querySelector('.bargrid-wrap');
    const node = ensureBarStateNode();
    if (!wrap || !node) return;
    const count = deviceCount();
    wrap.classList.remove('chart-empty','chart-lite','chart-ready');
    if (count <= 0){
      wrap.classList.add('chart-empty');
      node.innerHTML = '<div><strong>Add devices to compare monthly use.</strong>NRG will show the bar comparison once your preset or custom devices are loaded.</div>';
    } else if (count < 4){
      wrap.classList.add('chart-lite');
      node.innerHTML = '<div><strong>Bar chart will get stronger as you add devices.</strong>The donut is best for a quick share view; the bar comparison becomes more useful around 4+ devices.</div>';
    } else {
      wrap.classList.add('chart-ready');
      node.innerHTML = '';
    }
  }
  const previousRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (previousRenderAll && !window.__nrgV274ChartWrap){
    window.__nrgV274ChartWrap = true;
    renderAll = function(){
      previousRenderAll.apply(this, arguments);
      setTimeout(updateSmartChartState, 0);
    };
  }
  document.addEventListener('DOMContentLoaded', updateSmartChartState);
  setTimeout(updateSmartChartState, 80);
})();


// NRG v27.6 — Device Schedule / Advanced Usage Details
// Optional scheduling stays additive: old hours/day behavior remains the fallback.
(function(){
  if (window.__nrgV276ScheduleDetails) return;
  window.__nrgV276ScheduleDetails = true;

  function cleanNum(v, fallback){
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
  function timeLabel(d){
    return (d.timeOfDay || d.usageWindow || d.scheduleTime || 'Any time').toString();
  }
  function isWeeklyScheduled(d){
    return d && d.scheduleMode === 'weekly' && cleanNum(d.usesPerWeek,0) > 0;
  }
  function calcDailyKwhV276(d){
    const w = cleanNum(d && d.watts, 0);
    const duty = clamp(cleanNum(d && d.duty, 100), 0, 100) / 100;
    const q = Math.max(1, parseInt((d && d.quantity) || 1, 10) || 1);
    if (isWeeklyScheduled(d)){
      const hpu = Math.max(0, cleanNum(d.hoursPerUse, cleanNum(d.hoursPerDay,0)));
      const upw = clamp(cleanNum(d.usesPerWeek,0), 0, 21);
      return (w * hpu * upw * duty * q) / 1000 / 7;
    }
    const h = Math.max(0, cleanNum(d && d.hoursPerDay, 0));
    return (w*h*duty*q)/1000;
  }
  // Override the global kWh helper used by summary/charts while preserving the same name.
  try { dailyKwh = calcDailyKwhV276; } catch(e) {}
  try { window.dailyKwh = calcDailyKwhV276; } catch(e) {}
  try { window.nrgDailyKwhV276 = calcDailyKwhV276; } catch(e) {}

  function monthlyKwh(d){
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    return calcDailyKwhV276(d) * dim;
  }
  function scheduleText(d){
    if (isWeeklyScheduled(d)){
      const hpu = cleanNum(d.hoursPerUse, cleanNum(d.hoursPerDay,0));
      const upw = cleanNum(d.usesPerWeek,0);
      return `${hpu} h/use · ${upw} uses/week · ${timeLabel(d)}`;
    }
    return `${cleanNum(d.hoursPerDay,0)} h/day · ${timeLabel(d)}`;
  }
  function applySchedulePrompts(idx){
    const item = (devices || [])[idx];
    if (!item) return;
    const mode = (prompt('Usage style for '+(item.name||'Device')+' — type daily or weekly', item.scheduleMode || 'daily') || '').trim().toLowerCase();
    if (!mode) return;
    if (mode.startsWith('w')){
      const wattsVal = prompt('Watts for this device', String(cleanNum(item.watts,0)));
      if (wattsVal === null) return;
      const hpuVal = prompt('Hours per use/session', String(cleanNum(item.hoursPerUse, cleanNum(item.hoursPerDay, 1))));
      if (hpuVal === null) return;
      const upwVal = prompt('Uses per week', String(cleanNum(item.usesPerWeek, 3)));
      if (upwVal === null) return;
      const todVal = prompt('Typical time of day (Morning, Afternoon, Evening, Overnight, or exact time)', item.timeOfDay || 'Evening');
      if (todVal === null) return;
      item.scheduleMode = 'weekly';
      item.watts = Math.max(0, cleanNum(wattsVal, item.watts||0));
      item.hoursPerUse = Math.max(0, cleanNum(hpuVal, item.hoursPerUse || item.hoursPerDay || 0));
      item.usesPerWeek = clamp(cleanNum(upwVal, item.usesPerWeek || 0), 0, 21);
      item.timeOfDay = (todVal || 'Any time').trim();
      // Keep hours/day as the daily average so older export/save views still make sense.
      item.hoursPerDay = (item.hoursPerUse * item.usesPerWeek / 7);
    } else {
      const wattsVal = prompt('Watts for this device', String(cleanNum(item.watts,0)));
      if (wattsVal === null) return;
      const hpdVal = prompt('Hours per day', String(cleanNum(item.hoursPerDay,0)));
      if (hpdVal === null) return;
      const todVal = prompt('Typical time of day (Morning, Afternoon, Evening, Overnight, or exact time)', item.timeOfDay || 'Any time');
      if (todVal === null) return;
      item.scheduleMode = 'daily';
      item.watts = Math.max(0, cleanNum(wattsVal, item.watts||0));
      item.hoursPerDay = Math.max(0, cleanNum(hpdVal, item.hoursPerDay||0));
      item.hoursPerUse = undefined;
      item.usesPerWeek = undefined;
      item.timeOfDay = (todVal || 'Any time').trim();
    }
    renderAll();
  }
  function enhanceDeviceRows(){
    const list = document.getElementById('mini-list');
    if (!list || !Array.isArray(devices)) return;
    const rows = Array.from(list.querySelectorAll('.mini-row'));
    rows.forEach((row, idx)=>{
      const d = devices[idx];
      if (!d) return;
      const nameBlock = row.querySelector('.mini-name')?.parentElement || row.firstElementChild;
      if (nameBlock && !nameBlock.querySelector('.mini-schedule')){
        const span = document.createElement('span');
        span.className = 'mini-schedule';
        nameBlock.appendChild(span);
      }
      const sched = nameBlock?.querySelector('.mini-schedule');
      if (sched){
        sched.innerHTML = `Schedule: ${scheduleText(d)} <span class="schedule-badge">${isWeeklyScheduled(d)?'weekly':'daily'}</span>`;
      }
      // Update the kWh/cost display to use the schedule-aware calculation.
      const costBox = row.querySelector('.mini-cost');
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const mk = monthlyKwh(d);
      if (costBox){ costBox.innerHTML = `${mk.toFixed(1)} kWh/mo<br>$${(mk*rate).toFixed(2)}/mo`; }
      if (!row.querySelector('.mini-schedule-btn')){
        const ref = row.querySelector('.mini-remove') || row.lastElementChild;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nrg-btn mini-btn mini-schedule-btn';
        btn.textContent = 'Schedule';
        btn.title = 'Set days/week, time of day, and schedule details';
        btn.dataset.idx = String(idx);
        btn.addEventListener('click', (e)=>{
          const i = parseInt(e.currentTarget.dataset.idx || '-1', 10);
          applySchedulePrompts(i);
        });
        if (ref && ref.parentElement === row) row.insertBefore(btn, ref);
        else row.appendChild(btn);
      } else {
        row.querySelector('.mini-schedule-btn').dataset.idx = String(idx);
      }
    });
    // Refresh mini summary totals using schedule-aware daily math after the old mini panel runs.
    try{
      const rate = parseFloat(document.getElementById('grid-rate')?.value || '0.15') || 0.15;
      const daily = devices.reduce((s,d)=>s+calcDailyKwhV276(d),0);
      const now = new Date();
      const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const miniKwh = document.getElementById('mini-kwh');
      const miniBill = document.getElementById('mini-bill');
      if (miniKwh) miniKwh.textContent = daily.toFixed(2);
      if (miniBill) miniBill.textContent = '$' + (daily*dim*rate).toFixed(2);
    }catch(e){}
  }

  const previousRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (previousRenderAll){
    renderAll = function(){
      previousRenderAll.apply(this, arguments);
      setTimeout(enhanceDeviceRows, 0);
    };
  }
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(enhanceDeviceRows, 80));
  setTimeout(enhanceDeviceRows, 120);
})();


// NRG v27.7 — Device Scroll Containment
// Adds a theme-safe internal scroll card around Your Devices after the first few rows.
(function(){
  if (window.__nrgV277DeviceScrollContainment) return;
  window.__nrgV277DeviceScrollContainment = true;

  function updateDeviceScrollState(){
    const pane = document.getElementById('pane-devices-mini');
    const list = document.getElementById('mini-list');
    if (!pane || !list) return;
    const rowCount = list.querySelectorAll('.mini-row').length;
    pane.classList.toggle('device-list-scrollable', rowCount > 3);
    list.setAttribute('aria-label', rowCount > 3 ? 'Scrollable device list' : 'Device list');
  }

  const previousRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (previousRenderAll){
    renderAll = function(){
      previousRenderAll.apply(this, arguments);
      setTimeout(updateDeviceScrollState, 0);
    };
  }
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(updateDeviceScrollState, 120));
  setTimeout(updateDeviceScrollState, 160);
})();


// NRG v27.8.1 — Inline per-device editing for preset and custom appliance cards.
(function(){
  if (window.__nrgV2781EditableResponsiveDeviceCards) return;
  window.__nrgV2781EditableResponsiveDeviceCards = true;

  let activeEditIndex = null;

  function cleanNumber(value, fallback){
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function cleanInt(value, fallback){
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function findRowForIndex(idx){
    const list = document.getElementById('mini-list');
    if (!list) return null;
    const editBtn = list.querySelector(`.mini-edit[data-idx="${idx}"]`);
    return editBtn ? editBtn.closest('.mini-row') : null;
  }

  function closeInlineEditor(){
    document.querySelectorAll('#mini-list .mini-inline-editor').forEach(el => el.remove());
    activeEditIndex = null;
  }

  function openInlineEditor(idx){
    const item = Array.isArray(window.devices) ? window.devices[idx] : (typeof devices !== 'undefined' ? devices[idx] : null);
    const row = findRowForIndex(idx);
    if (!item || !row) return;

    document.querySelectorAll('#mini-list .mini-inline-editor').forEach(el => el.remove());
    activeEditIndex = idx;

    const editor = document.createElement('div');
    editor.className = 'mini-inline-editor';
    editor.dataset.idx = String(idx);
    editor.innerHTML = `
      <div class="mini-inline-editor-title">Edit this card individually</div>
      <div class="mini-edit-grid">
        <label class="mini-edit-field"><span>Name</span><input class="nrg-input mini-edit-name" type="text" value="${escapeHtml(item.name || 'Device')}"></label>
        <label class="mini-edit-field"><span>Watts</span><input class="nrg-input mini-edit-watts" type="number" min="0" step="1" value="${escapeHtml(+item.watts || 0)}"></label>
        <label class="mini-edit-field"><span>Hours/day</span><input class="nrg-input mini-edit-hours" type="number" min="0" step="0.05" value="${escapeHtml(+item.hoursPerDay || 0)}"></label>
        <label class="mini-edit-field"><span>Duty %</span><input class="nrg-input mini-edit-duty" type="number" min="0" max="100" step="1" value="${escapeHtml(+item.duty || 100)}"></label>
        <label class="mini-edit-field"><span>Quantity</span><input class="nrg-input mini-edit-qty" type="number" min="1" step="1" value="${escapeHtml(+item.quantity || 1)}"></label>
      </div>
      <div class="mini-edit-actions">
        <button type="button" class="nrg-btn mini-inline-save">Save card</button>
        <button type="button" class="nrg-btn mini-inline-cancel">Cancel</button>
      </div>
    `;
    row.appendChild(editor);
    editor.querySelector('.mini-edit-name')?.focus();
  }

  function saveInlineEditor(editor){
    const idx = parseInt(editor?.dataset?.idx || '-1', 10);
    const list = Array.isArray(window.devices) ? window.devices : (typeof devices !== 'undefined' ? devices : []);
    const item = list[idx];
    if (!item) return;

    item.name = (editor.querySelector('.mini-edit-name')?.value || 'Device').trim() || 'Device';
    item.watts = Math.max(0, cleanNumber(editor.querySelector('.mini-edit-watts')?.value, item.watts || 0));
    item.hoursPerDay = Math.max(0, cleanNumber(editor.querySelector('.mini-edit-hours')?.value, item.hoursPerDay || 0));
    item.duty = Math.max(0, Math.min(100, cleanNumber(editor.querySelector('.mini-edit-duty')?.value, item.duty || 100)));
    item.quantity = Math.max(1, cleanInt(editor.querySelector('.mini-edit-qty')?.value, item.quantity || 1));
    item.source = item.source || (/baseline|fridge|microwave|stove|washer|dryer|dehumidifier|lighting/i.test(item.name || '') ? 'Preset' : 'User Edited');

    activeEditIndex = null;
    if (typeof renderAll === 'function') renderAll();
  }

  // Capture the existing prompt-based Edit click and replace it with the inline editor.
  document.addEventListener('click', function(e){
    const editBtn = e.target.closest && e.target.closest('#mini-list .mini-edit');
    if (editBtn){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const idx = parseInt(editBtn.getAttribute('data-idx') || '-1', 10);
      if (idx >= 0) openInlineEditor(idx);
      return;
    }
    const saveBtn = e.target.closest && e.target.closest('#mini-list .mini-inline-save');
    if (saveBtn){
      e.preventDefault();
      const editor = saveBtn.closest('.mini-inline-editor');
      saveInlineEditor(editor);
      return;
    }
    const cancelBtn = e.target.closest && e.target.closest('#mini-list .mini-inline-cancel');
    if (cancelBtn){
      e.preventDefault();
      closeInlineEditor();
    }
  }, true);

  // Keep rows responsive after every app render, including after preset changes.
  const previousRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (previousRenderAll){
    renderAll = function(){
      previousRenderAll.apply(this, arguments);
      setTimeout(function(){
        if (activeEditIndex !== null) openInlineEditor(activeEditIndex);
      }, 0);
    };
  }
})();


// NRG v27.8.2 — Keep Edit / Schedule / Remove inside every device card.
(function(){
  if (window.__nrgV2782MinimizedDesktopActionBarFix) return;
  window.__nrgV2782MinimizedDesktopActionBarFix = true;

  function groupDeviceActionButtons(){
    const rows = document.querySelectorAll('#mini-list .mini-row');
    rows.forEach((row)=>{
      const edit = row.querySelector(':scope > .mini-edit');
      const schedule = row.querySelector(':scope > .mini-schedule-btn');
      const remove = row.querySelector(':scope > .mini-remove');
      if (!edit && !schedule && !remove) return;

      let bar = row.querySelector(':scope > .mini-actions-bar');
      if (!bar){
        bar = document.createElement('div');
        bar.className = 'mini-actions-bar';
        bar.setAttribute('aria-label', 'Device actions');
      }

      // Preserve button listeners by moving the actual button nodes, not recreating them.
      [edit, schedule, remove].forEach((btn)=>{
        if (btn && btn.parentElement !== bar) bar.appendChild(btn);
      });

      // Keep the editor after the action bar so opening Edit stays inside this same card.
      const editor = row.querySelector(':scope > .mini-inline-editor');
      if (editor) row.insertBefore(bar, editor);
      else row.appendChild(bar);

      row.classList.add('has-action-bar');
    });
  }

  const priorRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (priorRenderAll){
    renderAll = function(){
      priorRenderAll.apply(this, arguments);
      setTimeout(groupDeviceActionButtons, 0);
      setTimeout(groupDeviceActionButtons, 80);
    };
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(groupDeviceActionButtons, 80);
    setTimeout(groupDeviceActionButtons, 220);
  });
  window.addEventListener('resize', ()=>setTimeout(groupDeviceActionButtons, 0));
  setTimeout(groupDeviceActionButtons, 260);
})();


// NRG v27.8.3 — Replace crowded Edit/Schedule/Remove buttons with one contained Actions select.
(function(){
  if (window.__nrgV2783CompactDeviceActions) return;
  window.__nrgV2783CompactDeviceActions = true;

  function ensureCompactActions(){
    const rows = document.querySelectorAll('#mini-list .mini-row');
    rows.forEach((row)=>{
      const edit = row.querySelector('.mini-edit');
      const schedule = row.querySelector('.mini-schedule-btn');
      const remove = row.querySelector('.mini-remove');
      if (!edit && !schedule && !remove) return;

      let wrap = row.querySelector(':scope > .mini-compact-actions');
      if (!wrap){
        wrap = document.createElement('div');
        wrap.className = 'mini-compact-actions';
        wrap.setAttribute('aria-label', 'Device actions');
        wrap.innerHTML = `
          <select class="mini-action-select" aria-label="Choose device action">
            <option value="">Actions</option>
            <option value="edit">Edit</option>
            <option value="schedule">Schedule</option>
            <option value="remove">Remove</option>
          </select>
        `;
        const select = wrap.querySelector('.mini-action-select');
        select.addEventListener('change', function(){
          const action = this.value;
          this.value = '';
          if (action === 'edit') row.querySelector('.mini-edit')?.click();
          if (action === 'schedule') row.querySelector('.mini-schedule-btn')?.click();
          if (action === 'remove') row.querySelector('.mini-remove')?.click();
        });
      }

      const editor = row.querySelector(':scope > .mini-inline-editor');
      if (editor) row.insertBefore(wrap, editor);
      else row.appendChild(wrap);
      row.classList.add('has-compact-actions');
    });
  }

  const previousRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (previousRenderAll){
    renderAll = function(){
      previousRenderAll.apply(this, arguments);
      setTimeout(ensureCompactActions, 0);
      setTimeout(ensureCompactActions, 80);
    };
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(ensureCompactActions, 80);
    setTimeout(ensureCompactActions, 220);
  });
  window.addEventListener('resize', ()=>setTimeout(ensureCompactActions, 0));
  setTimeout(ensureCompactActions, 260);
})();


// NRG v27.8.4 — Three-dot action menu: Edit / Schedule / Remove stay inside card at every width.
(function(){
  if (window.__nrgV2784DotActionMenuContainment) return;
  window.__nrgV2784DotActionMenuContainment = true;

  function ensureDotActions(){
    const rows = document.querySelectorAll('#mini-list .mini-row');
    rows.forEach((row)=>{
      const edit = row.querySelector('.mini-edit');
      const schedule = row.querySelector('.mini-schedule-btn');
      const remove = row.querySelector('.mini-remove');
      if (!edit && !schedule && !remove) return;

      // Remove the previous compact select wrapper if it exists.
      row.querySelectorAll(':scope > .mini-compact-actions').forEach(el => el.remove());

      let dotWrap = row.querySelector(':scope > .mini-dot-actions');
      if (!dotWrap){
        dotWrap = document.createElement('div');
        dotWrap.className = 'mini-dot-actions';
        dotWrap.innerHTML = '<button type="button" class="nrg-btn mini-dot-btn" title="Device actions" aria-label="Open device actions" aria-expanded="false">⋯</button>';
        dotWrap.querySelector('.mini-dot-btn')?.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          const open = !row.classList.contains('dot-open');
          document.querySelectorAll('#mini-list .mini-row.dot-open').forEach(r=>{
            if (r !== row){
              r.classList.remove('dot-open');
              r.querySelector('.mini-dot-btn')?.setAttribute('aria-expanded','false');
            }
          });
          row.classList.toggle('dot-open', open);
          this.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }

      let panel = row.querySelector(':scope > .mini-dot-panel');
      if (!panel){
        panel = document.createElement('div');
        panel.className = 'mini-dot-panel';
        panel.setAttribute('aria-label', 'Device action choices');
        panel.innerHTML = `
          <button type="button" class="nrg-btn mini-dot-edit">Edit</button>
          <button type="button" class="nrg-btn mini-dot-schedule">Schedule</button>
          <button type="button" class="nrg-btn mini-dot-remove">Remove</button>
        `;
        panel.querySelector('.mini-dot-edit')?.addEventListener('click', (e)=>{
          e.preventDefault();
          row.classList.remove('dot-open');
          row.querySelector('.mini-edit')?.click();
        });
        panel.querySelector('.mini-dot-schedule')?.addEventListener('click', (e)=>{
          e.preventDefault();
          row.classList.remove('dot-open');
          row.querySelector('.mini-schedule-btn')?.click();
        });
        panel.querySelector('.mini-dot-remove')?.addEventListener('click', (e)=>{
          e.preventDefault();
          row.classList.remove('dot-open');
          row.querySelector('.mini-remove')?.click();
        });
      }

      const editor = row.querySelector(':scope > .mini-inline-editor');
      if (!row.contains(dotWrap)) row.appendChild(dotWrap);
      if (editor){
        row.insertBefore(dotWrap, editor);
        row.insertBefore(panel, editor);
      } else {
        row.appendChild(dotWrap);
        row.appendChild(panel);
      }
      row.classList.add('has-dot-actions');
    });
  }

  const priorRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (priorRenderAll){
    renderAll = function(){
      priorRenderAll.apply(this, arguments);
      setTimeout(ensureDotActions, 0);
      setTimeout(ensureDotActions, 80);
    };
  }

  document.addEventListener('click', function(e){
    if (!e.target.closest || e.target.closest('#mini-list .mini-row')) return;
    document.querySelectorAll('#mini-list .mini-row.dot-open').forEach(row=>{
      row.classList.remove('dot-open');
      row.querySelector('.mini-dot-btn')?.setAttribute('aria-expanded','false');
    });
  });
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(ensureDotActions, 80);
    setTimeout(ensureDotActions, 220);
  });
  window.addEventListener('resize', ()=>setTimeout(ensureDotActions, 0));
  setTimeout(ensureDotActions, 260);
})();


// NRG v27.8.5 — Keep edit mode clean and contained after choosing Edit from the dot menu.
(function(){
  if (window.__nrgV2785EditPanelContainmentLock) return;
  window.__nrgV2785EditPanelContainmentLock = true;

  document.addEventListener('click', function(e){
    const editChoice = e.target.closest && e.target.closest('#mini-list .mini-dot-edit');
    if (!editChoice) return;
    const row = editChoice.closest('.mini-row');
    if (row){
      row.classList.remove('dot-open');
      row.classList.add('editing-contained');
      row.querySelector('.mini-dot-btn')?.setAttribute('aria-expanded','false');
    }
  }, true);

  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('#mini-list .mini-inline-save, #mini-list .mini-inline-cancel')){
      document.querySelectorAll('#mini-list .mini-row.editing-contained').forEach(row=>row.classList.remove('editing-contained'));
    }
  }, true);
})();


// NRG v27.8.6 — Device Card Polish Lock: clarity, highlight, one-open-card discipline.
(function(){
  if (window.__nrgV2786DeviceCardPolishLock) return;
  window.__nrgV2786DeviceCardPolishLock = true;

  function polishDeviceRows(){
    const rows = document.querySelectorAll('#mini-list .mini-row.has-dot-actions');
    rows.forEach((row)=>{
      const nameWrap = row.firstElementChild;
      if (nameWrap && !nameWrap.querySelector('.mini-card-helper')){
        const helper = document.createElement('span');
        helper.className = 'mini-card-helper';
        helper.textContent = 'Use ⋯ to edit, schedule, or remove';
        nameWrap.appendChild(helper);
      }
      const btn = row.querySelector('.mini-dot-btn');
      if (btn){
        btn.title = 'Manage this device';
        btn.setAttribute('aria-label','Manage this device');
      }
    });
  }

  // One card open/editing at a time keeps minimized desktop and mobile clean.
  document.addEventListener('click', function(e){
    const dot = e.target.closest && e.target.closest('#mini-list .mini-dot-btn');
    if (dot){
      const row = dot.closest('.mini-row');
      document.querySelectorAll('#mini-list .mini-row.editing-contained').forEach(r=>{
        if (r !== row) r.classList.remove('editing-contained');
      });
    }

    const editChoice = e.target.closest && e.target.closest('#mini-list .mini-dot-edit');
    if (editChoice){
      const row = editChoice.closest('.mini-row');
      document.querySelectorAll('#mini-list .mini-row.dot-open, #mini-list .mini-row.editing-contained').forEach(r=>{
        if (r !== row){
          r.classList.remove('dot-open','editing-contained');
          r.querySelector('.mini-dot-btn')?.setAttribute('aria-expanded','false');
          r.querySelector(':scope > .mini-inline-editor')?.remove();
        }
      });
      if (row) row.classList.add('editing-contained');
    }

    const scheduleOrRemove = e.target.closest && e.target.closest('#mini-list .mini-dot-schedule, #mini-list .mini-dot-remove');
    if (scheduleOrRemove){
      const row = scheduleOrRemove.closest('.mini-row');
      if (row){
        row.classList.remove('dot-open');
        row.querySelector('.mini-dot-btn')?.setAttribute('aria-expanded','false');
      }
    }
  }, true);

  const priorRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (priorRenderAll){
    renderAll = function(){
      priorRenderAll.apply(this, arguments);
      setTimeout(polishDeviceRows, 0);
      setTimeout(polishDeviceRows, 120);
    };
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(polishDeviceRows, 120);
    setTimeout(polishDeviceRows, 300);
  });
  window.addEventListener('resize', ()=>setTimeout(polishDeviceRows, 0));
  setTimeout(polishDeviceRows, 300);
})();


// NRG v27.8.10 — Local AI Advisor: clearer language + status tags from current on-page device data only.
(function(){
  if (window.__nrgV2787AIAdvisorLocalIntelligence) return;
  window.__nrgV2787AIAdvisorLocalIntelligence = true;

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function money(v){ return '$' + (Number(v)||0).toFixed(2); }
  function one(v){ return (Number(v)||0).toFixed(1); }
  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function getDevices(){
    try { if (Array.isArray(devices)) return devices; } catch(e){}
    try { if (Array.isArray(window.devices)) return window.devices; } catch(e){}
    return [];
  }
  function rate(){ return parseFloat($('grid-rate')?.value || '0.15') || 0.15; }
  function kwhDay(d){
    const w=+d.watts||0, h=+d.hoursPerDay||0, duty=(+d.duty||100)/100, q=+d.quantity||1;
    return Math.max(0, (w*h*duty*q)/1000);
  }
  function kwhMonth(d){ return kwhDay(d) * monthDays(); }
  function isAlwaysOn(d){ return (+d.hoursPerDay||0) >= 20; }
  function isHighWattLowDuty(d){ return (+d.watts||0) >= 700 && (+d.hoursPerDay||0) <= 2.5; }
  function isLowWattLongRun(d){ return (+d.watts||0) <= 120 && (+d.hoursPerDay||0) >= 6; }
  function nameOf(d){ return (d && d.name ? String(d.name) : 'Device').trim() || 'Device'; }
  function card(label, title, body, metric, pill){
    return `<div class="ai-tip ai-card">
      <div class="ai-card-kicker"><span class="ai-card-label">${esc(label)}</span>${pill?`<span class="ai-card-pill">${esc(pill)}</span>`:''}</div>
      <div class="ai-card-title">${esc(title)}</div>
      <div class="ai-card-body">${esc(body)}</div>
      ${metric?`<div class="ai-card-metric">${esc(metric)}</div>`:''}
    </div>`;
  }

  function buildAdvisor(){
    const box = $('ai-tips');
    if (!box) return;
    const list = getDevices().filter(Boolean);
    box.classList.remove('empty');

    if (!list.length){
      box.innerHTML = `<div class="ai-tip ai-card"><div class="ai-card-title">Add devices to wake up the Advisor.</div><div class="ai-card-body">Once devices are added, NRG will identify the biggest energy driver, always-on loads, high-watt short-use items, and simple adjustment opportunities.</div></div>`;
      return;
    }

    const dim = monthDays();
    const r = rate();
    const rows = list.map(d => ({ d, name:nameOf(d), kwh:kwhMonth(d), day:kwhDay(d), watts:+d.watts||0, hours:+d.hoursPerDay||0, duty:+d.duty||100, qty:+d.quantity||1 }))
      .sort((a,b)=>b.kwh-a.kwh);
    const totalKwh = rows.reduce((s,x)=>s+x.kwh,0);
    const totalCost = totalKwh * r;
    const top = rows[0];
    const topShare = totalKwh > 0 ? (top.kwh / totalKwh * 100) : 0;
    const always = rows.filter(x=>isAlwaysOn(x.d));
    const highShort = rows.filter(x=>isHighWattLowDuty(x.d));
    const lowLong = rows.filter(x=>isLowWattLongRun(x.d));

    let watch = top;
    let watchBody = `${top.name} is the current bill driver. This is not a warning by itself — it simply means changes to this card will move the monthly estimate more than the others.`;
    let watchPill = 'top load';
    if (always.length){
      watch = always[0];
      watchBody = `${watch.name} behaves like a baseline load. Because it runs for long hours, even moderate wattage can quietly shape the monthly bill.`;
      watchPill = 'baseline';
    }

    let explainTitle = 'Your load pattern looks balanced';
    let explainBody = 'NRG is not seeing one extreme pattern yet. Add real schedules or duty cycles to help the Advisor separate short bursts from steady background use.';
    let explainMetric = '';
    let explainPill = 'pattern';
    if (highShort.length){
      const x = highShort[0];
      explainTitle = `${x.name} is high watt, but short-use`;
      explainBody = 'High wattage can look dramatic, but short runtime often costs less than a smaller device that runs for many hours.';
      explainMetric = `${Math.round(x.watts)}W × ${one(x.hours)}h/day ≈ ${one(x.kwh)} kWh/mo`;
      explainPill = 'context';
    } else if (lowLong.length){
      const x = lowLong[0];
      explainTitle = `${x.name} is low watt, but long-running`;
      explainBody = 'Small devices can still matter when they run for many hours. This is where timers, schedules, and realistic duty cycles give NRG a better picture.';
      explainMetric = `${Math.round(x.watts)}W × ${one(x.hours)}h/day ≈ ${one(x.kwh)} kWh/mo`;
      explainPill = 'adds up';
    }

    const peak = parseFloat($('ai-peak')?.value || '0.22') || 0.22;
    const off = parseFloat($('ai-off')?.value || '0.12') || 0.12;
    const spread = Math.max(0, peak - off);
    const shiftable = rows.filter(x => /(washer|dryer|dishwasher|microwave|kettle|toaster|stove|range|oven|heater|dehumidifier|humidifier|fan|lamp|light)/i.test(x.name));
    const shiftKwh = shiftable.slice(0,3).reduce((s,x)=>s+x.kwh,0);
    const shiftSave = shiftKwh * spread * 0.35;
    const start = $('ai-start')?.value || '22';
    const end = $('ai-end')?.value || '7';

    let adjustmentTitle = 'Small adjustment: refine schedules';
    let adjustmentBody = 'Use Schedule on the device cards to replace rough estimates with real timing. Better timing makes the bill projection and advice sharper.';
    let adjustmentMetric = 'Accuracy boost, not just savings';
    let adjustmentPill = 'next step';
    if (shiftSave > 0.25){
      adjustmentTitle = 'Possible off-peak opportunity';
      adjustmentBody = `Flexible devices may cost less during ${start}:00 → ${end}:00 if your utility has off-peak pricing. Treat this as a planning clue, not a command.`;
      adjustmentMetric = `Potential: about ${money(shiftSave)} / month`;
      adjustmentPill = 'schedule';
    } else if (top && totalKwh > 0){
      const trim = top.kwh * 0.10 * r;
      adjustmentTitle = `Try a 10% trim on ${top.name}`;
      adjustmentBody = 'A small runtime or duty-cycle reduction on the biggest load usually has the cleanest impact because it targets the current top contributor.';
      adjustmentMetric = `10% trim estimate: ${money(trim)} / month`;
      adjustmentPill = 'simple';
    }

    box.innerHTML = `
      <div class="ai-advisor-summary" aria-label="AI Advisor summary">
        <div class="ai-summary-tile"><div class="muted">Devices</div><div class="big">${rows.length}</div></div>
        <div class="ai-summary-tile"><div class="muted">Monthly kWh</div><div class="big">${one(totalKwh)}</div></div>
        <div class="ai-summary-tile"><div class="muted">Est. Cost</div><div class="big">${money(totalCost)}</div></div>
        <div class="ai-summary-tile"><div class="muted">Top Share</div><div class="big">${one(topShare)}%</div></div>
      </div>
      <div class="ai-advisor-grid">
        ${card('Main Insight', `${top.name} leads the estimate`, `${top.name} is currently the largest contributor in this setup, accounting for about ${one(topShare)}% of the monthly kWh estimate.`, `${one(top.kwh)} kWh/mo at ${money(r)}/kWh`, 'driver')}
        ${card('Watch Item', `${watch.name} deserves attention`, watchBody, `${one(watch.kwh)} kWh/mo`, watchPill)}
        ${card('Usage Context', explainTitle, explainBody, explainMetric, explainPill)}
        ${card('Possible Adjustment', adjustmentTitle, adjustmentBody, adjustmentMetric, adjustmentPill)}
      </div>
      <div class="ai-contained-note">Local Advisor only: this guidance is generated from your on-page NRG device data. No cloud call, no account, no outside AI API.</div>
    `;
  }

  window.nrgRunLocalAdvisor = buildAdvisor;

  function installButton(){
    const oldBtn = $('ai-run');
    if (!oldBtn || oldBtn.dataset.nrgV2787 === '1') return;
    const btn = oldBtn.cloneNode(true);
    btn.dataset.nrgV2787 = '1';
    btn.textContent = 'Update Advisor';
    btn.title = 'Update local energy advice from current devices';
    oldBtn.replaceWith(btn);
    btn.addEventListener('click', function(e){
      e.preventDefault();
      buildAdvisor();
    });
  }

  function wrapRenderAll(){
    try{
      if (typeof renderAll === 'function' && !window.__nrgV2787RenderWrapped){
        const prior = renderAll;
        renderAll = function(){
          const result = prior.apply(this, arguments);
          setTimeout(buildAdvisor, 0);
          return result;
        };
        window.__nrgV2787RenderWrapped = true;
      }
    }catch(e){}
  }

  function init(){
    installButton();
    wrapRenderAll();
    setTimeout(buildAdvisor, 60);
    setTimeout(buildAdvisor, 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  ['input','change'].forEach(evt=>{
    document.addEventListener(evt, function(e){
      if (e.target && /^(grid-rate|ai-peak|ai-off|ai-start|ai-end)$/.test(e.target.id||'')){
        setTimeout(buildAdvisor, 0);
      }
    });
  });
})();


// NRG v27.8.11 — Contained Schedule Intelligence Preview for each device card.
(function(){
  if (window.__nrgV27811ScheduleIntelligencePreview) return;
  window.__nrgV27811ScheduleIntelligencePreview = true;

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function num(v, fb){ const n=parseFloat(v); return Number.isFinite(n) ? n : fb; }
  function int(v, fb){ const n=parseInt(v,10); return Number.isFinite(n) ? n : fb; }
  function devicesList(){ try{ if(Array.isArray(window.devices)) return window.devices; }catch(e){} try{ if(Array.isArray(devices)) return devices; }catch(e){} return []; }
  function daysInMonth(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function rate(){ return num(document.getElementById('grid-rate')?.value, .15); }
  function money(v){ return '$' + (Number(v)||0).toFixed(2); }
  function one(v){ return (Number(v)||0).toFixed(1); }
  function nameOf(d){ return (d && d.name ? String(d.name) : 'Device').trim() || 'Device'; }
  function modeOf(d){ return (d.scheduleMode || (d.usesPerWeek ? 'weekly' : 'daily')).toString().toLowerCase().startsWith('w') ? 'weekly' : 'daily'; }
  function scheduledDailyKwh(d){
    const watts = Math.max(0, num(d.watts, 0));
    const qty = Math.max(1, num(d.quantity, 1));
    const duty = Math.max(0, Math.min(100, num(d.duty, 100))) / 100;
    if (modeOf(d) === 'weekly'){
      const hpu = Math.max(0, num(d.hoursPerUse, num(d.hoursPerDay, 0)));
      const upw = Math.max(0, num(d.usesPerWeek, 0));
      return (watts * hpu * upw / 7 * duty * qty) / 1000;
    }
    return (watts * Math.max(0, num(d.hoursPerDay, 0)) * duty * qty) / 1000;
  }
  function scheduleImpactText(d){
    const n = nameOf(d);
    const hours = num(d.hoursPerDay,0);
    const watts = num(d.watts,0);
    const t = String(d.timeOfDay || '').toLowerCase();
    if (hours >= 20) return `${n} appears always-on. Schedule this carefully; the preview is better for tracking baseline usage than turning it off.`;
    if (/overnight|off|night|22|23|00|1|2|3|4|5|6/.test(t)) return `${n} is marked for a lower-demand window. This can support off-peak planning if your utility uses time-of-use rates.`;
    if (watts >= 700 && hours <= 2.5) return `${n} is high-watt but short-use. Scheduling can organize usage, but monthly impact may stay modest because runtime is short.`;
    if (watts <= 120 && hours >= 6) return `${n} is low-watt but long-running. A timer or realistic duty cycle can sharpen the estimate.`;
    return `${n} has a normal schedule profile. Use this panel to keep timing, runtime, and expected cost visible inside the card.`;
  }
  function findIndexFromRow(row){
    const source = row?.querySelector('.mini-schedule-btn, .mini-edit, .mini-remove');
    return int(source?.getAttribute('data-idx'), -1);
  }
  function closeSchedules(except){
    document.querySelectorAll('#mini-list .mini-schedule-panel').forEach(p=>{ if(p!==except) p.remove(); });
    document.querySelectorAll('#mini-list .mini-row.schedule-contained').forEach(r=>{ if(!except || r!==except.closest('.mini-row')) r.classList.remove('schedule-contained'); });
  }
  function renderPreview(panel, d){
    const monthly = scheduledDailyKwh(d) * daysInMonth();
    const cost = monthly * rate();
    const mode = modeOf(d);
    const timing = d.timeOfDay || 'Any time';
    panel.querySelector('.mini-schedule-preview').innerHTML = `
      <div class="mini-schedule-preview-card"><div class="label">Mode</div><div class="value">${mode === 'weekly' ? 'Weekly usage' : 'Daily usage'}</div></div>
      <div class="mini-schedule-preview-card"><div class="label">Projected</div><div class="value">${one(monthly)} kWh/mo</div></div>
      <div class="mini-schedule-preview-card"><div class="label">Est. Cost</div><div class="value">${money(cost)}/mo</div></div>
    `;
    panel.querySelector('.mini-schedule-note').textContent = scheduleImpactText(d) + ` Current timing: ${timing}.`;
  }
  function openSchedulePanel(row){
    const list = devicesList();
    const idx = findIndexFromRow(row);
    const d = list[idx];
    if (!row || !d) return;
    closeSchedules();
    row.classList.remove('dot-open');
    row.querySelector('.mini-dot-btn')?.setAttribute('aria-expanded','false');
    row.querySelector(':scope > .mini-inline-editor')?.remove();
    row.classList.remove('editing-contained');
    row.classList.add('schedule-contained');

    const mode = modeOf(d);
    const panel = document.createElement('div');
    panel.className = 'mini-schedule-panel';
    panel.dataset.idx = String(idx);
    panel.innerHTML = `
      <div class="mini-schedule-title"><span>Schedule ${esc(nameOf(d))}</span><span class="mini-schedule-badge">Preview</span></div>
      <div class="mini-schedule-grid">
        <label class="mini-schedule-field"><span>Mode</span><select class="nrg-input mini-sch-mode"><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        <label class="mini-schedule-field mini-sch-daily"><span>Hours/day</span><input class="nrg-input mini-sch-hours" type="number" min="0" step="0.05" value="${esc(num(d.hoursPerDay,0))}"></label>
        <label class="mini-schedule-field mini-sch-weekly"><span>Hours/use</span><input class="nrg-input mini-sch-hpu" type="number" min="0" step="0.05" value="${esc(num(d.hoursPerUse, num(d.hoursPerDay,1)))}"></label>
        <label class="mini-schedule-field mini-sch-weekly"><span>Uses/week</span><input class="nrg-input mini-sch-upw" type="number" min="0" step="1" value="${esc(num(d.usesPerWeek,3))}"></label>
        <label class="mini-schedule-field"><span>Time</span><select class="nrg-input mini-sch-time">
          ${['Any time','Morning','Afternoon','Evening','Overnight','Off-peak'].map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}
        </select></label>
      </div>
      <div class="mini-schedule-preview" aria-label="Schedule estimate preview"></div>
      <div class="mini-schedule-note"></div>
      <div class="mini-schedule-actions">
        <button type="button" class="nrg-btn mini-sch-save">Save schedule</button>
        <button type="button" class="nrg-btn mini-sch-cancel">Cancel</button>
      </div>
    `;
    row.appendChild(panel);
    const modeInput = panel.querySelector('.mini-sch-mode');
    const timeInput = panel.querySelector('.mini-sch-time');
    modeInput.value = mode;
    timeInput.value = ['Any time','Morning','Afternoon','Evening','Overnight','Off-peak'].includes(d.timeOfDay) ? d.timeOfDay : 'Any time';
    function sync(){
      const weekly = modeInput.value === 'weekly';
      panel.querySelectorAll('.mini-sch-weekly').forEach(el=>el.style.display = weekly ? 'flex' : 'none');
      panel.querySelectorAll('.mini-sch-daily').forEach(el=>el.style.display = weekly ? 'none' : 'flex');
      const clone = Object.assign({}, d);
      clone.scheduleMode = modeInput.value;
      clone.hoursPerDay = num(panel.querySelector('.mini-sch-hours')?.value, d.hoursPerDay || 0);
      clone.hoursPerUse = num(panel.querySelector('.mini-sch-hpu')?.value, d.hoursPerUse || d.hoursPerDay || 0);
      clone.usesPerWeek = num(panel.querySelector('.mini-sch-upw')?.value, d.usesPerWeek || 0);
      clone.timeOfDay = timeInput.value;
      renderPreview(panel, clone);
    }
    panel.addEventListener('input', sync);
    panel.addEventListener('change', sync);
    panel.querySelector('.mini-sch-save').addEventListener('click', function(e){
      e.preventDefault();
      d.scheduleMode = modeInput.value;
      d.timeOfDay = timeInput.value;
      if (d.scheduleMode === 'weekly'){
        d.hoursPerUse = Math.max(0, num(panel.querySelector('.mini-sch-hpu')?.value, d.hoursPerUse || d.hoursPerDay || 0));
        d.usesPerWeek = Math.max(0, num(panel.querySelector('.mini-sch-upw')?.value, d.usesPerWeek || 0));
        d.hoursPerDay = d.hoursPerUse * d.usesPerWeek / 7;
      } else {
        d.hoursPerDay = Math.max(0, num(panel.querySelector('.mini-sch-hours')?.value, d.hoursPerDay || 0));
        d.hoursPerUse = undefined;
        d.usesPerWeek = undefined;
      }
      if (typeof renderAll === 'function') renderAll();
      setTimeout(()=>{ if (window.nrgRunLocalAdvisor) window.nrgRunLocalAdvisor(); }, 0);
    });
    panel.querySelector('.mini-sch-cancel').addEventListener('click', function(e){
      e.preventDefault();
      panel.remove();
      row.classList.remove('schedule-contained');
    });
    sync();
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('#mini-list .mini-dot-schedule');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openSchedulePanel(btn.closest('.mini-row'));
  }, true);

  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('#mini-list .mini-dot-btn, #mini-list .mini-dot-edit, #mini-list .mini-dot-remove')){
      closeSchedules();
    }
  }, true);

  const priorRenderAll = typeof renderAll === 'function' ? renderAll : null;
  if (priorRenderAll){
    renderAll = function(){
      const result = priorRenderAll.apply(this, arguments);
      setTimeout(closeSchedules, 0);
      return result;
    };
  }
})();


// NRG v27.8.14 — final pre-push stability polish. UI containment/version marker only.
(function(){
  if (window.__nrgV27813GitHubPrePushStabilityPolish) return;
  window.__nrgV27813GitHubPrePushStabilityPolish = true;
  window.NRG_RELEASE_VERSION = 'v27.8.14';
  function addVersionChip(){
    try{
      var existing = document.querySelector('.nrg-version-chip');
      if (!existing){
        var chip = document.createElement('div');
        chip.className = 'nrg-version-chip';
        chip.textContent = 'NRG v27.8.14';
        chip.setAttribute('aria-hidden','true');
        document.body.appendChild(chip);
      } else {
        existing.textContent = 'NRG v27.8.14';
      }
    }catch(e){}
  }
  function markRelease(){
    try{ document.documentElement.setAttribute('data-nrg-release','v27.8.14'); }catch(e){}
    addVersionChip();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markRelease); else markRelease();
})();


// NRG v27.8.12 — Top 3 Energy Drivers + compact device badges. Local/offline only.
(function(){
  if (window.__nrgV27812TopDriversDeviceBadges) return;
  window.__nrgV27812TopDriversDeviceBadges = true;

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function num(v, fb){ const n=parseFloat(v); return Number.isFinite(n) ? n : fb; }
  function money(v){ return '$' + (Number(v)||0).toFixed(2); }
  function one(v){ return (Number(v)||0).toFixed(1); }
  function monthDays(){ const n=new Date(); return new Date(n.getFullYear(), n.getMonth()+1, 0).getDate(); }
  function devicesList(){ try{ if(Array.isArray(window.devices)) return window.devices; }catch(e){} try{ if(Array.isArray(devices)) return devices; }catch(e){} return []; }
  function rate(){ return num($('grid-rate')?.value, .15); }
  function nameOf(d){ return (d && d.name ? String(d.name) : 'Device').trim() || 'Device'; }
  function kwhDay(d){
    const watts = Math.max(0, num(d.watts, 0));
    const qty = Math.max(1, num(d.quantity, 1));
    const duty = Math.max(0, Math.min(100, num(d.duty, 100))) / 100;
    return (watts * Math.max(0, num(d.hoursPerDay, 0)) * duty * qty) / 1000;
  }
  function kwhMonth(d){ return kwhDay(d) * monthDays(); }
  function rows(){
    const r = rate();
    return devicesList().filter(Boolean).map((d, idx)=>({
      d, idx, name:nameOf(d), watts:num(d.watts,0), hours:num(d.hoursPerDay,0), duty:num(d.duty,100), qty:num(d.quantity,1), kwh:kwhMonth(d), cost:kwhMonth(d)*r
    })).sort((a,b)=>b.kwh-a.kwh);
  }
  function badgeFor(d){
    const watts = num(d.watts,0), hours = num(d.hoursPerDay,0), duty = num(d.duty,100), name = nameOf(d);
    if (hours >= 20) return {label:'Always-On', cls:'badge-always-on'};
    if (watts >= 900 && hours <= 2.5) return {label:'Short Burst', cls:'badge-short-burst'};
    if (watts >= 700 || kwhMonth(d) >= 90) return {label:'High Load', cls:'badge-high-load'};
    if (watts <= 120 && hours >= 6) return {label:'Long Run', cls:'badge-long-run'};
    if (kwhMonth(d) <= 15 || duty <= 35 || /led|light|lamp/i.test(name)) return {label:'Efficient', cls:'badge-efficient'};
    return {label:'Tracked', cls:'badge-tracked'};
  }
  function card(label, title, body, metric, pill){
    return `<div class="ai-tip ai-card">
      <div class="ai-card-kicker"><span class="ai-card-label">${esc(label)}</span>${pill?`<span class="ai-card-pill">${esc(pill)}</span>`:''}</div>
      <div class="ai-card-title">${esc(title)}</div>
      <div class="ai-card-body">${esc(body)}</div>
      ${metric?`<div class="ai-card-metric">${esc(metric)}</div>`:''}
    </div>`;
  }
  function topDriversCard(sorted, total){
    const top3 = sorted.slice(0,3);
    if (!top3.length) return '';
    return `<div class="ai-top-drivers-card" aria-label="Top 3 energy drivers">
      <div class="ai-top-drivers-head"><div class="ai-top-drivers-title">Top 3 Energy Drivers</div><div class="ai-top-drivers-pill">Monthly Impact</div></div>
      <div class="ai-top-drivers-list">
        ${top3.map((x,i)=>{
          const share = total > 0 ? (x.kwh / total * 100) : 0;
          return `<div class="ai-driver-tile">
            <div class="ai-driver-rank">${i+1}</div>
            <div class="ai-driver-name" title="${esc(x.name)}">${esc(x.name)}</div>
            <div class="ai-driver-meta">${one(x.kwh)} kWh/mo • ${money(x.cost)} • ${one(share)}%</div>
            <div class="ai-driver-bar" aria-hidden="true"><span style="--pct:${Math.max(2, Math.min(100, share)).toFixed(1)}%"></span></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  function renderAdvisor(){
    const box = $('ai-tips');
    if (!box) return;
    const sorted = rows();
    box.classList.remove('empty');
    if (!sorted.length){
      box.innerHTML = `<div class="ai-tip ai-card"><div class="ai-card-title">Add devices to wake up the Advisor.</div><div class="ai-card-body">Once devices are added, NRG will identify the top energy drivers and add compact badges to each device card.</div></div>`;
      renderDeviceBadges();
      return;
    }
    const r = rate();
    const totalKwh = sorted.reduce((s,x)=>s+x.kwh,0);
    const totalCost = totalKwh * r;
    const top = sorted[0];
    const topShare = totalKwh > 0 ? (top.kwh / totalKwh * 100) : 0;
    const always = sorted.filter(x=>x.hours >= 20);
    const highShort = sorted.filter(x=>x.watts >= 700 && x.hours <= 2.5);
    const lowLong = sorted.filter(x=>x.watts <= 120 && x.hours >= 6);
    const watch = always[0] || top;
    const watchBody = always[0]
      ? `${watch.name} behaves like a baseline load. Long runtime can quietly shape the monthly bill even when wattage is not extreme.`
      : `${top.name} is the current bill driver. This simply means edits or schedules on this card will move the estimate the most.`;
    let explainTitle = 'Your load pattern looks balanced';
    let explainBody = 'NRG is not seeing one extreme pattern yet. Add schedules or realistic duty cycles to separate short bursts from steady background use.';
    let explainMetric = 'Use badges to scan each card faster';
    let explainPill = 'pattern';
    if (highShort.length){
      const x = highShort[0];
      explainTitle = `${x.name} is high watt, but short-use`;
      explainBody = 'High wattage looks dramatic, but short runtime can cost less than a smaller device running all day.';
      explainMetric = `${Math.round(x.watts)}W × ${one(x.hours)}h/day ≈ ${one(x.kwh)} kWh/mo`;
      explainPill = 'short burst';
    } else if (lowLong.length){
      const x = lowLong[0];
      explainTitle = `${x.name} is low watt, but long-running`;
      explainBody = 'Small devices can still matter when they run for many hours. This is where schedules and duty cycle tuning help.';
      explainMetric = `${Math.round(x.watts)}W × ${one(x.hours)}h/day ≈ ${one(x.kwh)} kWh/mo`;
      explainPill = 'long run';
    }
    const peak = num($('ai-peak')?.value, .22), off = num($('ai-off')?.value, .12);
    const spread = Math.max(0, peak - off);
    const shiftable = sorted.filter(x => /(washer|dryer|dishwasher|microwave|kettle|toaster|stove|range|oven|heater|dehumidifier|humidifier|fan|lamp|light)/i.test(x.name));
    const shiftKwh = shiftable.slice(0,3).reduce((s,x)=>s+x.kwh,0);
    const shiftSave = shiftKwh * spread * 0.35;
    const start = $('ai-start')?.value || '22', end = $('ai-end')?.value || '7';
    let adjTitle = 'Use Schedule on your top devices';
    let adjBody = 'The Top 3 card shows where schedule edits matter most. Start with the highest driver before chasing tiny loads.';
    let adjMetric = `Start with ${top.name}`;
    let adjPill = 'next step';
    if (shiftSave > .25){
      adjTitle = 'Possible off-peak opportunity';
      adjBody = `Flexible devices may cost less during ${start}:00 → ${end}:00 if your utility uses time-of-use rates.`;
      adjMetric = `Potential: about ${money(shiftSave)} / month`;
      adjPill = 'schedule';
    }
    box.innerHTML = `
      <div class="ai-advisor-summary" aria-label="AI Advisor summary">
        <div class="ai-summary-tile"><div class="muted">Devices</div><div class="big">${sorted.length}</div></div>
        <div class="ai-summary-tile"><div class="muted">Monthly kWh</div><div class="big">${one(totalKwh)}</div></div>
        <div class="ai-summary-tile"><div class="muted">Est. Cost</div><div class="big">${money(totalCost)}</div></div>
        <div class="ai-summary-tile"><div class="muted">Top Share</div><div class="big">${one(topShare)}%</div></div>
      </div>
      ${topDriversCard(sorted, totalKwh)}
      <div class="ai-advisor-grid">
        ${card('Main Insight', `${top.name} leads the estimate`, `${top.name} currently accounts for about ${one(topShare)}% of the monthly kWh estimate.`, `${one(top.kwh)} kWh/mo at ${money(r)}/kWh`, 'driver')}
        ${card('Watch Item', `${watch.name} deserves attention`, watchBody, `${one(watch.kwh)} kWh/mo`, always[0]?'baseline':'top load')}
        ${card('Usage Context', explainTitle, explainBody, explainMetric, explainPill)}
        ${card('Possible Adjustment', adjTitle, adjBody, adjMetric, adjPill)}
      </div>
      <div class="ai-contained-note">Local Advisor only: this guidance is generated from your on-page NRG device data. No cloud call, no account, no outside AI API.</div>
    `;
    renderDeviceBadges();
  }
  function findIndex(row){
    const src = row?.querySelector('.mini-schedule-btn, .mini-edit, .mini-remove, .mini-dot-menu [data-idx]');
    const raw = src?.getAttribute('data-idx');
    const idx = parseInt(raw ?? '-1', 10);
    return Number.isFinite(idx) ? idx : -1;
  }
  function renderDeviceBadges(){
    const list = devicesList();
    document.querySelectorAll('#mini-list .mini-row').forEach((row)=>{
      const idx = findIndex(row);
      const d = list[idx];
      if (!d) return;
      const host = row.querySelector('.mini-name')?.parentElement || row.firstElementChild;
      if (!host) return;
      let b = host.querySelector('.mini-device-badge');
      if (!b){ b = document.createElement('span'); b.className = 'mini-device-badge'; host.appendChild(b); }
      const info = badgeFor(d);
      b.className = 'mini-device-badge ' + info.cls;
      b.textContent = info.label;
      b.title = 'NRG local label: ' + info.label;
    });
  }
  window.nrgRunLocalAdvisor = renderAdvisor;
  window.nrgRenderDeviceBadges = renderDeviceBadges;
  function wrapRenderAll(){
    try{
      if (typeof renderAll === 'function' && !window.__nrgV27812RenderWrapped){
        const prior = renderAll;
        renderAll = function(){
          const result = prior.apply(this, arguments);
          setTimeout(()=>{ renderAdvisor(); renderDeviceBadges(); }, 0);
          return result;
        };
        window.__nrgV27812RenderWrapped = true;
      }
    }catch(e){}
  }
  function init(){
    wrapRenderAll();
    const btn = $('ai-run');
    if (btn && btn.dataset.nrgV27812 !== '1'){
      btn.dataset.nrgV27812 = '1';
      btn.textContent = 'Update Advisor';
      btn.addEventListener('click', function(e){ e.preventDefault(); renderAdvisor(); }, true);
    }
    setTimeout(renderAdvisor, 80);
    setTimeout(renderDeviceBadges, 120);
    setTimeout(renderAdvisor, 450);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  ['input','change'].forEach(evt=>document.addEventListener(evt, function(e){
    if (e.target && /^(grid-rate|ai-peak|ai-off|ai-start|ai-end)$/.test(e.target.id||'')) setTimeout(renderAdvisor, 0);
  }));
})();


(function(){
  function buildRoadmap(){
    if (document.getElementById('nrg-roadmap-panel')) return;
    var app = document.getElementById('app');
    if (!app) return;
    var section = document.createElement('section');
    section.id = 'nrg-roadmap-panel';
    section.className = 'nrg-card';
    section.setAttribute('aria-label','NRG roadmap and future trajectory');
    section.innerHTML = `
      <div class="nrg-roadmap-shell">
        <div class="nrg-roadmap-head">
          <div>
            <h3>NRG Roadmap / Trajectory</h3>
            <p>NRG is locked as an offline-first household energy simulator today. Future online features should be optional, user-controlled, and added only through a clear Offline Mode / Online Assist Mode choice.</p>
          </div>
          <div class="nrg-roadmap-chip">v27.8.14 Roadmap Lock</div>
        </div>
        <div class="nrg-roadmap-grid">
          <div class="nrg-roadmap-card"><b>1. Electricity Rate API</b><span>Optional local/utility rate lookup for smarter peak, off-peak, and schedule guidance.</span></div>
          <div class="nrg-roadmap-card"><b>2. Weather API</b><span>Optional weather-aware context for heating/cooling load and seasonal usage swings.</span></div>
          <div class="nrg-roadmap-card"><b>3. Smart Plug / Matter</b><span>Future bridge to real smart plugs, smart lights, and Matter-compatible devices where users allow it.</span></div>
          <div class="nrg-roadmap-card"><b>4. AI API Assistant</b><span>Optional cloud-assisted explanations for bills, usage patterns, savings ideas, and device behavior.</span></div>
          <div class="nrg-roadmap-card"><b>5. Utility Import</b><span>Future bill or usage import so NRG can compare estimated use against real-world monthly totals.</span></div>
          <div class="nrg-roadmap-card"><b>6. Appliance Lookup</b><span>Suggested wattage ranges for common devices like PS5, mini fridge, air fryer, TV, router, and more.</span></div>
        </div>
        <div class="nrg-roadmap-next"><strong>Next build rule:</strong> Before any API is added, create the mode switch first: <strong>Offline Mode</strong> for local/manual estimates and <strong>Online Assist Mode</strong> for user-approved API features.</div>
      </div>`;
    app.appendChild(section);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildRoadmap); else buildRoadmap();
})();
