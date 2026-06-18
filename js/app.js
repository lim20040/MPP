async function saveTask() {
    const title = document.getElementById('taskTitle').value;
    const duration = document.getElementById('taskTime').value;

    const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, duration })
    });

    if (response.ok) {
        alert("MPP에 일정이 저장되었습니다!");
    } else {
        alert("저장 실패");
    }
}