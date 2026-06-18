let cart = []; // 임시로 담아둘 장바구니

// 1. 과목 담기 기능
function addLecture() {
    const subject = document.getElementById('subject').value;
    const lecture = document.getElementById('lecture').value;
    const duration = parseInt(document.getElementById('duration').value);

    if(!subject || !lecture || !duration) return alert("빈칸을 모두 채워주세요!");

    cart.push({ subject, lecture, duration });
    renderCart(); // 화면에 그리기

    // 다음 입력을 위해 과목 빼고 비워주기
    document.getElementById('lecture').value = '';
    document.getElementById('duration').value = '';
}

// 2. 장바구니 화면에 보여주기
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

// 3. 자동 스케줄 짜기 & DB 저장
async function generateAndSave() {
    const dailyLimit = parseInt(document.getElementById('dailyLimit').value);
    if(cart.length === 0) return alert("먼저 강의를 목록에 담아주세요!");

    let day = 1;
    let todayUsed = 0;
    let finalSchedule = [];

    // [핵심 분배 로직]
    cart.forEach(lec => {
        // 오늘 남은 시간보다 강의가 길면 다음 날로 넘김
        if (todayUsed + lec.duration > dailyLimit && todayUsed > 0) {
            day++;
            todayUsed = 0;
        }
        finalSchedule.push({ ...lec, day: day });
        todayUsed += lec.duration;
    });

    // 백엔드 서버(API)로 전송
    const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: finalSchedule })
    });

    if(res.ok) {
        alert("성공적으로 분배 및 저장되었습니다!");
        cart = []; // 장바구니 비우기
        renderCart();
        loadSchedule(); // 저장된 스케줄 불러오기
    }
}

// 4. DB에서 스케줄 불러오기
async function loadSchedule() {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    
    const box = document.getElementById('scheduleResult');
    if(data.length === 0) return box.innerHTML = "저장된 스케줄이 없습니다.";

    let html = '';
    let currentDay = 0;

    data.forEach(task => {
        if(task.day !== currentDay) {
            currentDay = task.day;
            html += `<div class="day-title">📅 Day ${currentDay}</div>`;
        }
        html += `<div class="item-row" style="padding-left: 10px;">
            <span><span class="subject-tag">${task.subject}</span> ${task.lecture}</span>
            <span>${task.duration}분</span>
        </div>`;
    });
    box.innerHTML = html;
}

// 사이트 켜자마자 내 스케줄 불러오기
window.onload = loadSchedule;