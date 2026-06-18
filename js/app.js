let cart = [];

// [페이지 로딩 시 작동]
window.onload = () => {
    if (document.getElementById('startDate')) {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;
        loadWeekSettings();
    }
    if (document.getElementById('scheduleResult')) {
        loadSchedule();
    }
};

// --- 요일별 설정 로컬 저장/불러오기 ---
function saveWeekSettings() {
    for(let i=0; i<7; i++) {
        localStorage.setItem(`mpp_time_${i}`, document.getElementById(`time-${i}`).value);
    }
}
function loadWeekSettings() {
    for(let i=0; i<7; i++) {
        const saved = localStorage.getItem(`mpp_time_${i}`);
        if(saved) document.getElementById(`time-${i}`).value = saved;
    }
}

// --- 1. 단건 추가 (OT 등) ---
function addLecture() {
    const subject = document.getElementById('subject').value;
    const lecture = document.getElementById('lecture').value;
    const duration = parseInt(document.getElementById('duration').value);
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if(!subject || !lecture || !duration || !startDate || !endDate) {
        return alert("모든 빈칸과 과목 기간을 입력해주세요!");
    }

    cart.push({ subject, lecture, duration, startDate, endDate });
    renderCart();
    saveWeekSettings();

    document.getElementById('lecture').value = '';
    document.getElementById('duration').value = '';
}

// --- 2. 연속 일괄 추가 (시간 입력란 펼치기) ---
function expandBulkInputs() {
    const start = parseInt(document.getElementById('bulkStart').value);
    const end = parseInt(document.getElementById('bulkEnd').value);

    if(isNaN(start) || isNaN(end) || start > end) {
        return alert("시작 강과 끝 강을 올바르게 입력해주세요!");
    }

    const area = document.getElementById('bulkExpandedArea');
    const btn = document.getElementById('btnConfirmBulk');
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;">';
    for(let i = start; i <= end; i++) {
        html += `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #F8FAFC; padding: 8px; border: 1px solid #E2E8F0; border-radius: 6px;">
            <span style="font-weight: 700; font-size: 0.9rem; color: #4F46E5;">${i}강</span>
            <input type="number" id="dur_${i}" placeholder="분" style="width: 60px; padding: 4px; margin: 0; text-align: center; border: 1px solid #CBD5E1; border-radius: 4px; background: white;">
        </div>`;
    }
    html += '</div>';
    
    area.innerHTML = html;
    area.style.display = 'block';
    btn.style.display = 'block';
}

// --- 3. 펼쳐진 칸의 시간들을 장바구니에 한 번에 담기 ---
function addExpandedLectures() {
    const subject = document.getElementById('subject').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const start = parseInt(document.getElementById('bulkStart').value);
    const end = parseInt(document.getElementById('bulkEnd').value);

    if(!subject || !startDate || !endDate) {
        return alert("위쪽의 과목명과 시작/종료 기간을 먼저 입력해주세요!");
    }

    for(let i = start; i <= end; i++) {
        const duration = parseInt(document.getElementById(`dur_${i}`).value);
        
        if(isNaN(duration) || duration <= 0) {
            return alert(`${i}강의 시간을 정확히 입력해주세요!`);
        }

        cart.push({
            subject: subject,
            lecture: i + '강',
            duration: duration,
            startDate: startDate,
            endDate: endDate
        });
    }

    renderCart();
    saveWeekSettings();

    document.getElementById('bulkExpandedArea').style.display = 'none';
    document.getElementById('btnConfirmBulk').style.display = 'none';
    document.getElementById('bulkStart').value = '';
    document.getElementById('bulkEnd').value = '';
}

// --- 4. 장바구니 화면에 그리기 (수정/삭제 포함) ---
function renderCart() {
    const box = document.getElementById('cartList');
    if(cart.length === 0) return box.innerHTML = "목록이 비어있습니다.";

    let html = '';
    cart.forEach((lec, index) => {
        html += `<div class="item-row">
            <div style="flex: 1; text-align: left;">
                <div style="margin-bottom: 4px;">
                    <span class="subject-tag">${lec.subject}</span> <b>${lec.lecture}</b>
                </div>
                <div style="font-size: 0.75rem; color: #888;">🗓️ ${lec.startDate} ~ ${lec.endDate}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number" value="${lec.duration}" 
                       onchange="updateCartItem(${index}, this.value)" 
                       style="width: 65px; padding: 6px; text-align: center; background: white; margin: 0; border: 1px solid #ccc;">분
                <button onclick="removeCartItem(${index})" 
                        style="width: auto; padding: 6px 10px; background: #EF4444; margin: 0; font-size: 0.8rem;">✖</button>
            </div>
        </div>`;
    });
    box.innerHTML = html;
}

function updateCartItem(index, newVal) {
    cart[index].duration = parseInt(newVal) || 0;
}

function removeCartItem(index) {
    cart.splice(index, 1);
    renderCart(); 
}

// --- 5. [핵심] 지능형 스케줄 자동 생성 및 저장 ---
async function generateAndSave() {
    if(cart.length === 0) return alert("먼저 강의를 목록에 담아주세요!");

    const weekLimits = {};
    for(let i=0; i<7; i++) {
        weekLimits[i] = parseInt(document.getElementById(`time-${i}`).value) || 0;
    }

    let globalCalendar = {}; 
    let finalSchedule = [];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    cart.forEach(lec => {
        let allocated = false;
        
        const [sY, sM, sD] = lec.startDate.split('-').map(Number);
        const [eY, eM, eD] = lec.endDate.split('-').map(Number);
        
        let current = new Date(sY, sM - 1, sD);
        const end = new Date(eY, eM - 1, eD);

        while (current <= end) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;
            
            const dayOfWeek = current.getDay(); 
            const totalLimitForDay = weekLimits[dayOfWeek]; 

            if (!globalCalendar[dateKey]) {
                globalCalendar[dateKey] = totalLimitForDay;
            }

            if (globalCalendar[dateKey] >= lec.duration) {
                globalCalendar[dateKey] -= lec.duration; 
                
                const formattedDate = `${dateKey} (${dayNames[dayOfWeek]})`;
                finalSchedule.push({ ...lec, assigned_date: formattedDate });
                allocated = true;
                break; 
            }

            current.setDate(current.getDate() + 1);
        }

        if (!allocated) {
            const formattedDate = `${lec.endDate} (${dayNames[end.getDay()]})`;
            finalSchedule.push({ ...lec, assigned_date: formattedDate });
        }
    });

    const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: finalSchedule })
    });

    if(res.ok) {
        alert("과목별 기간 및 요일별 시간을 고려하여 최적의 계획이 수립되었습니다!");
        cart = [];
        window.location.href = 'index.html';
    }
}

// --- 6. 스케줄 불러오기 (index.html 전용) ---
async function loadSchedule() {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    
    const box = document.getElementById('scheduleResult');
    if(data.length === 0) return box.innerHTML = "저장된 스케줄이 없습니다. '새 일정 만들기' 메뉴에서 일정을 생성해주세요.";

    let html = '';
    let currentDate = '';

    data.forEach(task => {
        if(task.assigned_date !== currentDate) {
            currentDate = task.assigned_date;
            html += `<div class="day-title">📅 ${currentDate}</div>`;
        }
        html += `<div class="item-row" style="padding-left: 15px;">
            <span><span class="subject-tag">${task.subject}</span> <b>${task.lecture}</b></span>
            <span>⏱️ ${task.duration}분</span>
        </div>`;
    });
    box.innerHTML = html;
}