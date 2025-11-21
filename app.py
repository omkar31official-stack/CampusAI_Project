from flask import (
    Flask, render_template, request, jsonify
)
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# =========================
# DATABASE CONFIG
# =========================

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///campusai.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


# =========================
# MODELS
# =========================

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    start = db.Column(db.String(40), nullable=False)   # ISO datetime string
    end = db.Column(db.String(40), nullable=True)
    location = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), nullable=False)
    description = db.Column(db.Text, nullable=True)


class RSVP(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)


class AttendanceLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    time = db.Column(db.String(40), nullable=False)
    class_code = db.Column(db.String(80), nullable=False)
    student = db.Column(db.String(80), nullable=False)
    engagement = db.Column(db.Float, nullable=False)
    sleepy = db.Column(db.Boolean, default=False)
    distracted = db.Column(db.Boolean, default=False)


# =========================
# IN-MEMORY LIVE CLASS STATE
# =========================
# class_code -> { student_name -> { "last_seen": timestamp, "engagement": score, "sleepy": bool, "distracted": bool } }

CLASS_STATE = {}


# =========================
# HELPERS
# =========================

def parse_iso(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str)


def init_db():
    """Create tables and insert sample events if DB is empty."""
    db.create_all()

    if Event.query.count() == 0:
        e1 = Event(
            title="Tech Talk: AI in Education",
            start="2025-11-22T10:00",
            end="2025-11-22T11:30",
            location="Main Auditorium",
            category="Seminar",
            description="Session on how AI is transforming classrooms."
        )
        e2 = Event(
            title="Coding Club Hackathon",
            start="2025-11-23T09:00",
            end="2025-11-23T17:00",
            location="Lab 3",
            category="Club",
            description="24-hour coding challenge for all branches."
        )
        e3 = Event(
            title="Mid-Sem Exam: Discrete Mathematics",
            start="2025-11-24T14:00",
            end="2025-11-24T16:00",
            location="Block B - Room 204",
            category="Academic",
            description="Mid-semester examination."
        )
        db.session.add_all([e1, e2, e3])
        db.session.commit()


# =========================
# PAGE ROUTES
# =========================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/calendar")
def calendar_page():
    return render_template("calendar.html")


@app.route("/classroom")
def classroom_page():
    return render_template("classroom.html")


@app.route("/teacher")
def teacher_page():
    return render_template("teacher_dashboard.html")


# =========================
# EVENT / CALENDAR APIS
# =========================

@app.route("/api/events", methods=["GET"])
def api_events():
    """Return all events with RSVP counts."""
    events = Event.query.all()
    result = []
    for ev in events:
        rsvp_count = RSVP.query.filter_by(event_id=ev.id).count()
        result.append({
            "id": ev.id,
            "title": ev.title,
            "start": ev.start,
            "end": ev.end,
            "location": ev.location,
            "category": ev.category,
            "description": ev.description or "",
            "rsvps": rsvp_count,
        })
    return jsonify({"events": result})


@app.route("/api/rsvp", methods=["POST"])
def api_rsvp():
    """
    Body JSON:
    {
      "event_id": 1,
      "name": "Omkar"
    }
    """
    data = request.get_json(force=True)
    event_id = int(data.get("event_id", 0))
    name = (data.get("name") or "").strip()
    if not event_id or not name:
        return jsonify({"status": "error", "message": "Missing event_id or name"}), 400

    event = Event.query.get(event_id)
    if not event:
        return jsonify({"status": "error", "message": "Event not found"}), 404

    existing = RSVP.query.filter_by(event_id=event_id, name=name).first()
    if not existing:
        r = RSVP(event_id=event_id, name=name)
        db.session.add(r)
        db.session.commit()

    count = RSVP.query.filter_by(event_id=event_id).count()
    return jsonify({"status": "ok", "rsvps": count})


@app.route("/api/notifications", methods=["GET"])
def api_notifications():
    """
    Query string: ?name=Omkar
    Returns events in next 24h where user RSVPed (or all if name empty).
    """
    name = (request.args.get("name") or "").strip()
    now = datetime.utcnow()
    soon = now + timedelta(days=1)

    upcoming = []
    events = Event.query.all()
    for ev in events:
        try:
            start = parse_iso(ev.start)
        except Exception:
            continue

        if now <= start <= soon:
            if not name:
                include = True
            else:
                include = RSVP.query.filter_by(event_id=ev.id, name=name).first() is not None

            if include:
                upcoming.append({
                    "id": ev.id,
                    "title": ev.title,
                    "start": ev.start,
                    "location": ev.location,
                })

    return jsonify({"notifications": upcoming})


# =========================
# ATTENDANCE / ENGAGEMENT APIS
# =========================

@app.route("/api/attendance", methods=["POST"])
def api_attendance():
    """
    Body JSON:
    {
      "classCode": "CSE-AI-101",
      "studentName": "Omkar",
      "engagement": 76.5,
      "sleepy": true/false,
      "distracted": true/false
    }
    """
    data = request.get_json(force=True)
    class_code = (data.get("classCode") or "").strip()
    student = (data.get("studentName") or "").strip()
    engagement = float(data.get("engagement") or 0.0)
    sleepy = bool(data.get("sleepy", False))
    distracted = bool(data.get("distracted", False))

    if not class_code or not student:
        return jsonify({"status": "error", "message": "Missing classCode or studentName"}), 400

    now = datetime.utcnow().isoformat(timespec="seconds")

    # Update live in-memory state
    if class_code not in CLASS_STATE:
        CLASS_STATE[class_code] = {}

    CLASS_STATE[class_code][student] = {
        "last_seen": now,
        "engagement": engagement,
        "sleepy": sleepy,
        "distracted": distracted,
    }

    # Save log to DB
    log = AttendanceLog(
        time=now,
        class_code=class_code,
        student=student,
        engagement=engagement,
        sleepy=sleepy,
        distracted=distracted,
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"status": "ok"})


@app.route("/api/class_state", methods=["GET"])
def api_class_state():
    """
    Query: ?classCode=CSE-AI-101
    Returns list of current students and engagement (from in-memory state).
    """
    class_code = (request.args.get("classCode") or "").strip()
    if not class_code:
        return jsonify({"status": "error", "message": "Missing classCode"}), 400

    students = []
    for student, info in CLASS_STATE.get(class_code, {}).items():
        students.append({
            "student": student,
            "engagement": info["engagement"],
            "last_seen": info["last_seen"],
            "sleepy": info.get("sleepy", False),
            "distracted": info.get("distracted", False),
        })

    avg_engagement = 0.0
    if students:
        avg_engagement = sum(s["engagement"] for s in students) / len(students)

    return jsonify({
        "status": "ok",
        "students": students,
        "average_engagement": avg_engagement,
    })


@app.route("/api/class_log", methods=["GET"])
def api_class_log():
    """
    Query: ?classCode=CSE-AI-101
    Returns engagement history from DB for graphs.
    """
    class_code = (request.args.get("classCode") or "").strip()
    if not class_code:
        return jsonify({"status": "error", "message": "Missing classCode"}), 400

    rows = (
        AttendanceLog.query
        .filter_by(class_code=class_code)
        .order_by(AttendanceLog.id)
        .all()
    )

    history = []
    for r in rows:
        history.append({
            "time": r.time,
            "class_code": r.class_code,
            "student": r.student,
            "engagement": r.engagement,
            "sleepy": r.sleepy,
            "distracted": r.distracted,
        })

    return jsonify({"status": "ok", "history": history})


# =========================
# MAIN
# =========================

if __name__ == "__main__":
    with app.app_context():
        init_db()
    app.run(debug=True)
