let chart = null;

async function fetchClassState(classCode) {
    const res = await fetch("/api/class_state?classCode=" + encodeURIComponent(classCode));
    return await res.json();
}

async function fetchClassLog(classCode) {
    const res = await fetch("/api/class_log?classCode=" + encodeURIComponent(classCode));
    return await res.json();
}

function renderStudentsTable(students) {
    const tbody = document.querySelector("#studentsTable tbody");
    tbody.innerHTML = "";
    students.forEach(s => {
        const tr = document.createElement("tr");
        const stateFlags = [];
        if (s.sleepy) stateFlags.push("Sleepy");
        if (s.distracted) stateFlags.push("Distracted");

        tr.innerHTML = `
          <td>${s.student}</td>
          <td>${Math.round(s.engagement)}</td>
          <td>${s.last_seen}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderChart(history) {
    const ctx = document.getElementById("engagementChart").getContext("2d");

    const labels = history.map(h => h.time);
    const values = history.map(h => h.engagement);

    // color per point based on sleepy / distracted
    const pointColors = history.map(h => {
        if (h.sleepy) return "rgba(239,68,68,0.95)";      // red
        if (h.distracted) return "rgba(249,115,22,0.95)"; // orange
        return "rgba(34,197,94,0.95)";                    // green
    });

    if (!chart) {
        chart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Engagement",
                    data: values,
                    borderColor: "rgba(59,130,246,0.9)",
                    backgroundColor: "rgba(59,130,246,0.25)",
                    pointBackgroundColor: pointColors,
                    pointBorderColor: pointColors,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.25
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: "#e5e7eb"
                        }
                    }
                },
                scales: {
                    y: {
                        suggestedMin: 0,
                        suggestedMax: 100,
                        ticks: { color: "#9ca3af" },
                        grid: { color: "rgba(55,65,81,0.5)" }
                    },
                    x: {
                        ticks: {
                            color: "#6b7280",
                            maxTicksLimit: 6
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    } else {
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.data.datasets[0].pointBackgroundColor = pointColors;
        chart.data.datasets[0].pointBorderColor = pointColors;
        chart.update();
    }
}

async function refreshDashboard(classCode) {
    const status = document.getElementById("dashStatus");
    const grid = document.getElementById("dashboardGrid");

    const state = await fetchClassState(classCode);
    if (state.status !== "ok") {
        status.textContent = "Error: " + state.message;
        return;
    }

    const log = await fetchClassLog(classCode);
    if (log.status !== "ok") {
        status.textContent = "Error: " + log.message;
        return;
    }

    status.textContent = "Average engagement: " + Math.round(state.average_engagement) + " / 100";
    grid.classList.remove("hidden");

    renderStudentsTable(state.students);
    renderChart(log.history);
}

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("dashLoadBtn");
    const input = document.getElementById("dashClassCode");

    let currentClass = "";

    btn.addEventListener("click", () => {
        const code = input.value.trim();
        if (!code) {
            alert("Enter class code.");
            return;
        }
        currentClass = code;
        refreshDashboard(currentClass);
    });

    // auto-refresh every 5 seconds
    setInterval(() => {
        if (currentClass) {
            refreshDashboard(currentClass);
        }
    }, 5000);
});
