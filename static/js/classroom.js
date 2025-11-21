let cam = null;
let faceMesh = null;

let engagementScore = 100;
let sleepyFrames = 0;
let noFaceFrames = 0;

let isSleepy = false;
let isDistracted = false;

let studentName = "";
let classCode = "";

// for time-based scoring
const MAX_SCORE = 100;
const MIN_SCORE = 0;
const PENALTY_INTERVAL_MS = 2000; // every 2 seconds
const PENALTY_POINTS = 1;         // -1 point each tick
const RECOVERY_INTERVAL_MS = 2000;
const RECOVERY_POINTS = 1;

let lastPenaltyTime = Date.now();
let lastRecoveryTime = Date.now();

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

function dist(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function ear(landmarks, idx) {
    const p1 = landmarks[idx[0]];
    const p2 = landmarks[idx[1]];
    const p3 = landmarks[idx[2]];
    const p4 = landmarks[idx[3]];
    const p5 = landmarks[idx[4]];
    const p6 = landmarks[idx[5]];

    const v1 = dist(p2, p6);
    const v2 = dist(p3, p5);
    const h = dist(p1, p4);
    return (v1 + v2) / (2.0 * h);
}

function updateUI() {
    document.getElementById("engagementScore").textContent = Math.round(engagementScore);
    const sleepyTag = document.getElementById("sleepyTag");
    const distractedTag = document.getElementById("distractedTag");
    sleepyTag.textContent = "Sleepy: " + (isSleepy ? "Yes" : "No");
    distractedTag.textContent = "Distracted: " + (isDistracted ? "Yes" : "No");
    sleepyTag.classList.toggle("alert", isSleepy);
    distractedTag.classList.toggle("alert", isDistracted);
}

function applyTimeBasedScoring() {
    const now = Date.now();

    if (isSleepy || isDistracted) {
        // penalty: every 2 seconds of sleepy or distracted => -1 point
        if (now - lastPenaltyTime >= PENALTY_INTERVAL_MS) {
            engagementScore -= PENALTY_POINTS;
            lastPenaltyTime = now;
        }
    } else {
        // recovery: every 2 seconds of good focus => +1 point (up to 100)
        if (engagementScore < MAX_SCORE && now - lastRecoveryTime >= RECOVERY_INTERVAL_MS) {
            engagementScore += RECOVERY_POINTS;
            lastRecoveryTime = now;
        }
    }

    if (engagementScore < MIN_SCORE) engagementScore = MIN_SCORE;
    if (engagementScore > MAX_SCORE) engagementScore = MAX_SCORE;

    updateUI();
}

async function sendAttendance() {
    if (!studentName || !classCode) return;

    try {
        await fetch("/api/attendance", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                classCode,
                studentName,
                engagement: engagementScore,
                sleepy: isSleepy,
                distracted: isDistracted
            })
        });
    } catch (e) {
        console.error("Attendance send error", e);
    }
}

function onResults(results) {
    const canvasElement = document.getElementById("outputCanvas");
    const videoElement = document.getElementById("inputVideo");
    const ctx = canvasElement.getContext("2d");

    ctx.save();
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // reset for this frame; we will set to true based on detection
    isSleepy = false;
    isDistracted = false;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const lm = results.multiFaceLandmarks[0];

        try {
            drawConnectors(ctx, lm, FACEMESH_TESSELATION, {lineWidth: 0.5});
        } catch (e) {}

        const le = ear(lm, LEFT_EYE);
        const re = ear(lm, RIGHT_EYE);
        const avg = (le + re) / 2.0;

        const TH = 0.21;
        if (avg < TH) {
            sleepyFrames++;
        } else {
            sleepyFrames = 0;
        }

        // we have a face in frame
        noFaceFrames = 0;

        // mark sleepy if eyes closed for some frames
        if (sleepyFrames > 12) {
            isSleepy = true;
        }
    } else {
        // no face detected – treat as distracted after some frames
        noFaceFrames++;
        if (noFaceFrames > 10) {
            isDistracted = true;
        }
    }

    // apply new scoring rules
    applyTimeBasedScoring();
    ctx.restore();
}

// send attendance every 5 seconds with current flags + score
setInterval(() => {
    sendAttendance();
}, 5000);

function startFaceMesh() {
    const videoElement = document.getElementById("inputVideo");
    const canvas = document.getElementById("outputCanvas");

    faceMesh = new FaceMesh({
        locateFile: f => "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + f
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    cam = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({image: videoElement});
        },
        width: 640,
        height: 480
    });
    cam.start();

    videoElement.addEventListener("loadedmetadata", () => {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("startBtn");
    const status = document.getElementById("statusText");
    const videoContainer = document.getElementById("video-container");
    const panel = document.getElementById("engagementPanel");

    startBtn.addEventListener("click", () => {
        studentName = document.getElementById("studentName").value.trim();
        classCode = document.getElementById("classCode").value.trim();

        if (!studentName || !classCode) {
            alert("Enter both name and class code.");
            return;
        }

        videoContainer.classList.remove("hidden");
        panel.classList.remove("hidden");
        status.textContent = "Monitoring " + studentName + " in class " + classCode + "...";

        navigator.mediaDevices.getUserMedia({video: true})
            .then(stream => {
                document.getElementById("inputVideo").srcObject = stream;
                startFaceMesh();
            })
            .catch(err => {
                console.error(err);
                status.textContent = "Could not access camera.";
            });
    });
});
