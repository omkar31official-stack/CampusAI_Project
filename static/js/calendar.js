let allEvents = [];
let currentCategory = "all";
let searchText = "";
let todayOnly = false;

function formatDateRange(startStr, endStr) {
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : null;

    const optsDate = { day: "numeric", month: "short" };
    const optsTime = { hour: "2-digit", minute: "2-digit" };

    if (!end) {
        return `${start.toLocaleDateString(undefined, optsDate)} · ${start.toLocaleTimeString(undefined, optsTime)}`;
    }

    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
        return `${start.toLocaleDateString(undefined, optsDate)} · ${start.toLocaleTimeString(undefined, optsTime)}–${end.toLocaleTimeString(undefined, optsTime)}`;
    }

    return `${start.toLocaleDateString(undefined, optsDate)}–${end.toLocaleDateString(undefined, optsDate)}`;
}

function passesFilters(ev) {
    // category filter
    if (currentCategory !== "all" && ev.category !== currentCategory) {
        return false;
    }

    // text search filter
    const haystack = (ev.title + " " + ev.location + " " + (ev.description || "")).toLowerCase();
    if (searchText && !haystack.includes(searchText)) {
        return false;
    }

    // today toggle
    if (todayOnly) {
        const start = new Date(ev.start);
        const now = new Date();
        return start.toDateString() === now.toDateString();
    }

    return true;
}

function categoryChip(category) {
    if (category === "Seminar") return `<span class="chip chip-blue">Seminar</span>`;
    if (category === "Club") return `<span class="chip chip-green">Club</span>`;
    if (category === "Academic") return `<span class="chip chip-orange">Academic</span>`;
    return `<span class="chip">${category}</span>`;
}

function buildEventCard(ev) {
    const rangeLabel = formatDateRange(ev.start, ev.end);
    const startDate = new Date(ev.start);
    const day = startDate.getDate();
    const month = startDate.toLocaleDateString(undefined, { month: "short" });
    const dow = startDate.toLocaleDateString(undefined, { weekday: "short" });

    const rsvpCount = ev.rsvps || 0;

    return `
      <div class="event-card">
        <div class="event-date">
          <div class="event-day">${day}</div>
          <div class="event-month">${month}</div>
          <div class="event-dow">${dow}</div>
        </div>
        <div class="event-main">
          <div class="event-title-row">
            <strong>${ev.title}</strong>
            ${categoryChip(ev.category)}
          </div>
          <div class="event-meta">
            <span>📍 ${ev.location}</span>
            <span>🕒 ${rangeLabel}</span>
          </div>
          <p class="event-description">${ev.description || ""}</p>
          <div class="event-actions">
            <div class="form-row">
              <input type="text" placeholder="Your name" data-event="${ev.id}" class="rsvp-name">
              <button type="button" data-event="${ev.id}" class="rsvp-btn">RSVP</button>
            </div>
            <div class="event-rsvp-info">
              <span class="pill pill-soft">RSVPs: <span id="rsvp-count-${ev.id}">${rsvpCount}</span></span>
            </div>
          </div>
        </div>
      </div>
    `;
}

function renderEvents() {
    const list = document.getElementById("eventsList");
    const filtered = allEvents.filter(passesFilters);

    list.innerHTML = "";

    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state">
          No events match your filters.
          <span class="empty-sub">Try clearing search or category filters.</span>
        </div>`;
    } else {
        filtered
            .sort((a, b) => new Date(a.start) - new Date(b.start))
            .forEach(ev => {
                list.insertAdjacentHTML("beforeend", buildEventCard(ev));
            });
    }

    // update count text
    const countEl = document.getElementById("eventCount");
    countEl.textContent = `${filtered.length} event${filtered.length === 1 ? "" : "s"}`;

    // wire RSVP buttons
    document.querySelectorAll(".rsvp-btn").forEach(btn => {
        btn.addEventListener("click", handleRsvpClick);
    });
}

async function handleRsvpClick(evt) {
    const eventId = evt.currentTarget.getAttribute("data-event");
    const input = document.querySelector(`input.rsvp-name[data-event="${eventId}"]`);
    const name = input.value.trim();
    if (!name) {
        alert("Enter your name to RSVP.");
        return;
    }

    const res2 = await fetch("/api/rsvp", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({event_id: Number(eventId), name})
    });
    const d2 = await res2.json();
    if (d2.status === "ok") {
        document.getElementById(`rsvp-count-${eventId}`).textContent = d2.rsvps;
        alert("RSVP saved.");
    } else {
        alert("Error: " + d2.message);
    }
}

async function loadEvents() {
    const res = await fetch("/api/events");
    const data = await res.json();
    allEvents = data.events || [];
    renderEvents();
}

async function loadNotifications() {
    const name = document.getElementById("notifName").value.trim();
    const res = await fetch("/api/notifications?name=" + encodeURIComponent(name));
    const data = await res.json();
    const list = document.getElementById("notifications");
    list.innerHTML = "";

    if (!data.notifications || data.notifications.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No upcoming events in the next 24 hours.";
        list.appendChild(li);
        return;
    }

    data.notifications.forEach(ev => {
        const li = document.createElement("li");
        const start = new Date(ev.start);
        li.textContent = `${ev.title} at ${ev.location} on ${start.toLocaleString()}`;
        list.appendChild(li);
    });
}

function setupFilters() {
    // category buttons
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentCategory = btn.getAttribute("data-category");
            renderEvents();
        });
    });

    // search bar
    const searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", () => {
        searchText = searchInput.value.trim().toLowerCase();
        renderEvents();
    });

    // today toggle
    const todayToggle = document.getElementById("todayToggle");
    todayToggle.addEventListener("change", () => {
        todayOnly = todayToggle.checked;
        renderEvents();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    loadEvents();
    setupFilters();

    document.getElementById("notifBtn").addEventListener("click", loadNotifications);
});
