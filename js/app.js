let cart = [];

// [페이지 로딩 시 작동] 날짜 기본값 오늘로 세팅 & 화면 데이터 불러오기
window.onload = () => {
    if (document.getElementById('startDate')) {
        // input.html 페이지일 때 날짜 기본값을 오늘로 설정
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
    }
    if (document.getElementById('scheduleResult')) {
        // index.html 페이지일 때 DB에서 데이터 불러오기
        loadSchedule();
    }
};

// 1. 담기 기능
function addLecture() {
    const subject = document.getElementById('subject').value;
    const lecture = document.getElementById('lecture').value;
    const duration = parseInt(document.getElementById('duration').value);

    if(!subject || !lecture || !duration) return alert("빈칸을 모두 채워주세요!");

    cart.push({ subject, lecture, duration });
    renderCart();

    document.getElementById('lecture').value = '';
    document.getElementById('duration').value = '';
}

function renderCart() {
    const box = document.getElementById('cartList');
    if(cart.length === 0) return box.innerHTML = "아직 담긴 강의가 없습니다.";

    let html = '';
    cart.forEach((lec) => {
        html += `<div class="item-row">
            <span><span class="subject-tag">${lec.subject}</span> ${lec.lecture}</span>
            <span>${lec.duration}분</span>
        </div>`;
    });
    box.innerHTML = html;
}

// [핵심] 2. 실제 날짜 기반 자동 스케줄 짜기
async function generateAndSave() {
    const dailyLimit = parseInt(document.getElementById('dailyLimit').value);
    const startDateValue = document.getElementById('startDate').value;
    
    if(cart.length === 0) return alert("먼저 강의를 목록에 담아주세요!");
    if(!startDateValue) return alert("시작 날짜를 선택해주세요!");

    let currentAssignDate = new Date(startDateValue);
    let todayUsed = 0;
    let finalSchedule = [];

    // 요일 한글 변환 배열
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    cart.forEach(lec => {
        // 남은 시간 부족하면 다음 날로 넘기기
        if (todayUsed + lec.duration > dailyLimit && todayUsed > 0) {
            currentAssignDate.setDate(currentAssignDate.getDate() + 1); // 하루 추가
            todayUsed = 0;
        }
        
        // 날짜 예쁘게 만들기 (예: 2026-06-19 (금))
        const y = currentAssignDate.getFullYear();
        const m = String(currentAssignDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentAssignDate.getDate()).padStart(2, '0');
        const dayStr = dayNames[currentAssignDate.getDay()];
        const formattedDate = `${y}-${m}-${d} (${dayStr})`;

        finalSchedule.push({ ...lec, assigned_date: formattedDate });
        todayUsed += lec.duration;
    });

    const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: finalSchedule })
    });

    if(res.ok) {
        alert("성공적으로 분배되었습니다! 내 스케줄 페이지로 이동합니다.");
        window.location.href = 'index.html'; // 저장 완료 시 메인 페이지로 자동 이동
    }
}

// 3. 스케줄 불러오기
async function loadSchedule() {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    
    const box = document.getElementById('scheduleResult');
    if(data.length === 0) return box.innerHTML = "저장된 스케줄이 없습니다.";

    let html = '';
    let currentDate = '';

    data.forEach(task => {
        if(task.assigned_date !== currentDate) {
            currentDate = task.assigned_date;
            // 날짜 구분선
            html += `<div class="day-title" style="background: #343a40;">${currentDate}</div>`;
        }
        html += `<div class="item-row" style="padding-left: 10px;">
            <span><span class="subject-tag">${task.subject}</span> ${task.lecture}</span>
            <span>${task.duration}분</span>
        </div>`;
    });
    box.innerHTML = html;
}