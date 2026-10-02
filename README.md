# IntraCity Medical Resource Tracker

> **A real-time, city-level emergency medical resource discovery, verification, and triage platform.**

Instead of just showing where hospitals are located on a map, IntraCity answers the urgent question:  
**"Which verified medical facility near me *currently* has the specific resource (ICU Bed, Ventilator, Oxygen, Blood Group, Ambulance) my patient needs right now — and how recently was it verified?"**

---

## 🌟 Core Features

1. **Hospital Directory & Live Map**
   - Interactive OpenStreetMap/Leaflet integration with custom markers reflecting live ICU bed availability.
   - Comprehensive facility cards showing live capacities, distance calculations (via Haversine formula), and status badges.
2. **Hospital-Wise Bed Availability**
   - Detailed breakdown for General Inpatient Beds and Emergency Triage Beds.
   - Tracks Total Capacity vs. Available Free Beds, complete with occupancy percentages and visual status bars.
3. **ICU & Critical Care Monitoring**
   - Dedicated monitoring for Adult/Pediatric ICU beds and Mechanical Ventilator units.
   - Immediate visual indicators and system alerts for facilities facing critical capacity depletion.
4. **Medical Oxygen Infrastructure**
   - Tracks oxygen-supported beds, reserve D/B-type oxygen cylinders, and liquid oxygen pipeline status (`Operational`, `Limited`, `Down`).
5. **City-Wide Blood Bank Central Exchange**
   - Live inventory matrix covering all 8 blood groups (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
   - Hospital-wise stock directory with direct 1-tap blood bank coordinator phone numbers.
6. **Emergency Ambulance Fleet**
   - Tracks Basic Life Support (BLS) and Advanced Cardiac Life Support (ALS) ambulances.
   - Shows active on-duty count and dedicated 24/7 driver/dispatch hotlines.
7. **Emergency Contacts & Rapid Triage**
   - 1-click dial buttons for Emergency Hotlines, Ambulance Dispatch, and Blood Bank Desks.
   - Instant turn-by-turn routing links to OpenStreetMap and Google Maps.
8. **Multi-Parameter Search & Filtering**
   - Filter by City, Sub-Area/Zone, specific Medical Resource, or Blood Group.
   - Keyword search across hospital names, medical specialties, and addresses.
   - Sort by Proximity (GPS/Reference coordinates), Most ICU Beds, General Beds, or Verification Freshness.
9. **Comprehensive Hospital Profile Modal**
   - Accessible native HTML `<dialog>` breakdown showing trauma care classification, full bed matrices, oxygen reserves, blood inventory, ambulance counts, and doctor specialties.
10. **Hospital Admin Portal & Audit Trail**
    - Secure PIN-authenticated management panel (`POST /api/admin/login`).
    - Tabbed/stepped update controls for publishing verified numbers for beds, oxygen, blood, and ambulances.
    - Persistent audit trail (`data/audit_logs.json`) recording updating officer name, timestamp, and changes.
11. **Resource Freshness Engine**
    - Color-coded freshness indicators:
      - 🟢 **Live (<10m)**: Confirmed in the last 10 minutes.
      - 🟡 **Verified (<45m)**: Confirmed recently within the current shift.
      - 🔴 **Stale (>1h)**: Verification older than 1 hour; triggers an automatic triage desk warning.
12. **Emergency Triage Match Wizard**
    - Urgent patient matching engine scoring facilities based on resource capacity, distance penalty, verification freshness, and emergency trauma readiness.
13. **Responsive Mobile-First UI**
    - Mobile bottom navigation bar for high-stress triage on small screens.
    - Loading skeletons, empty states with filter reset options, and accessible toast notifications.

---

## 🏗️ Architecture & Data Flow

```
┌────────────────────────────────────────────────────────┐
│                   Citizen / Triage UI                  │
│   (Vanilla JS, Semantic HTML5, CSS Grid, Leaflet OSM)  │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
       HTTP REST API (GET)        HTTP REST API (PATCH / POST)
                │                        │
┌───────────────▼────────────────────────▼───────────────┐
│               Express.js Application Server            │
│  - Distance Calculation (Haversine Formula)           │
│  - Triage Ranking Algorithm                            │
│  - Alert Generation Engine (Shortages & Stale Data)    │
│  - Security PIN Authentication & Input Sanitization    │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
        Read / Write JSON        Append Audit Entry
                │                        │
┌───────────────▼─────────┐    ┌─────────▼───────────────┐
│   data/hospitals.json   │    │   data/audit_logs.json  │
│  (Hospital Database)    │    │   (Verification Trail)  │
└─────────────────────────┘    └─────────────────────────┘
```

---

## 🚀 Installation & Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher; LTS recommended)
- `npm` (included with Node.js)

### Step-by-Step Instructions

1. **Clone or navigate to the project directory**:
   ```bash
   cd intracity-medical-resource-tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application server**:
   ```bash
   npm start
   ```
   *For development with auto-reload (Node.js 18+):*
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to [http://localhost:5000](http://localhost:5000)

---

## 🔑 Demo Credentials

To access the **Hospital Resource Management Portal**:
- **Hospital ID**: Select any facility (e.g. `H001` - Patna Apex, `H002` - CityCare, `H003` - Magadh Heart)
- **Demo PIN**: `1234`

---

## 📡 REST API Documentation

### 1. `GET /api/hospitals`
Retrieve hospital directory with optional filtering and distance sorting.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `q` | String | Keyword search across name, area, address, and specialties |
| `city` | String | Filter by city name (e.g., `Patna`, `Barh`, `Gaya`) |
| `area` | String | Filter by area/zone (e.g., `Bailey Road`, `Kankarbagh`) |
| `resource` | String | Filter by available resource: `icu`, `ventilator`, `oxygen`, `blood`, `ambulance`, `emergency`, `general` |
| `bloodGroup` | String | Filter by specific blood type: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |
| `emergencyOnly` | Boolean | If `true`, returns only facilities accepting emergency admissions |
| `lat` & `lng` | Float | User coordinates for calculating `distanceKm` |
| `sort` | String | Sort by: `distance`, `icu`, `generalBeds`, `freshness`, `name` |

**Sample Response:**
```json
{
  "success": true,
  "count": 8,
  "data": [
    {
      "id": "H001",
      "name": "Patna Apex Super Speciality Hospital",
      "type": "Government Multi-Speciality",
      "city": "Patna",
      "area": "Bailey Road",
      "address": "Plot 14, Bailey Road, Near High Court, Patna, Bihar 800001",
      "lat": 25.6093,
      "lng": 85.1235,
      "contacts": {
        "emergency": "+91-612-2500101",
        "ambulance": "+91-9800000101",
        "bloodBank": "+91-612-2500105",
        "reception": "+91-612-2500100"
      },
      "emergencyReady": true,
      "traumaLevel": "Level 1 Trauma Center",
      "resources": {
        "generalBeds": { "total": 120, "available": 34 },
        "emergencyBeds": { "total": 24, "available": 7 },
        "icuBeds": { "total": 20, "available": 5 },
        "ventilators": { "total": 12, "available": 3 },
        "oxygen": {
          "supportedBeds": 45,
          "cylindersAvailable": 28,
          "pipelineStatus": "Operational"
        },
        "blood": { "A+": 14, "O+": 22, "O-": 5 },
        "ambulances": { "bls": 4, "als": 2, "onDuty": 5, "dispatchContact": "+91-9800000101" }
      },
      "lastVerified": "2026-10-02T10:15:00.000Z",
      "freshness": { "label": "Live (<10m)", "level": "green", "minutesAgo": 4 },
      "distanceKm": 1.2
    }
  ]
}
```

---

### 2. `GET /api/hospitals/:id`
Retrieve detailed profile for a single medical facility by ID (e.g., `H001`).

---

### 3. `GET /api/match`
Emergency triage recommendation endpoint.

**Query Parameters:**
- `lat` (required): Patient latitude
- `lng` (required): Patient longitude
- `resource` (optional): `icu` (default), `ventilator`, `oxygen`, `blood`, `ambulance`, `emergency`
- `bloodGroup` (optional): `O+`, `O-`, etc.

**Response:** Returns top 6 ranked hospitals ordered by `matchScore` (computed using capacity, proximity penalty, freshness bonus, and trauma care tier).

---

### 4. `GET /api/stats`
Returns aggregated metrics across all verified facilities:
```json
{
  "success": true,
  "stats": {
    "totalHospitals": 8,
    "emergencyReadyHospitals": 7,
    "generalBeds": { "total": 690, "available": 261 },
    "icuBeds": { "total": 110, "available": 26 },
    "ventilators": { "total": 60, "available": 13 },
    "oxygen": { "supportedBeds": 233, "cylindersAvailable": 154 },
    "ambulancesOnDuty": 26,
    "bloodUnitsTotal": 312
  }
}
```

---

### 5. `GET /api/alerts`
Generates live system alerts for:
- Critical ICU shortages (`icuBeds.available <= 1`)
- Mechanical ventilator depletion (`ventilators.available == 0`)
- Ambulance fleet downtime (`ambulances.onDuty == 0`)
- Oxygen pipeline disruptions
- Rare blood stock depletion (`O-`, `AB-`, `B-`, `A-` at 0 units)
- Stale data warnings (`lastVerified > 60 minutes`)

---

### 6. `POST /api/admin/login`
Validates hospital credentials before allowing updates.
- **Body**: `{ "hospitalId": "H001", "pin": "1234" }`

---

### 7. `PATCH /api/hospitals/:id/resources`
Publishes verified updates to facility resource counts.
- **Body**:
  ```json
  {
    "pin": "1234",
    "updatedBy": "Dr. A. Sharma / Duty Medical Officer",
    "note": "Shift handoff verification",
    "emergencyReady": true,
    "resources": {
      "icuBeds": { "total": 20, "available": 6 },
      "ventilators": { "total": 12, "available": 4 },
      "oxygen": {
        "supportedBeds": 45,
        "cylindersAvailable": 30,
        "pipelineStatus": "Operational"
      }
    }
  }
  ```
- **Response**: Refreshes `lastVerified` timestamp, writes to `data/hospitals.json`, and records an entry into `data/audit_logs.json`.

---

### 8. `GET /api/audit-logs`
Retrieve recent verification logs with optional `hospitalId` filter.

---

## 🚢 Deployment Guide

### Option 1: Docker
Create a `Dockerfile` in the root:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "server/server.js"]
```
Build and run:
```bash
docker build -t intracity-tracker .
docker run -p 5000:5000 intracity-tracker
```

### Option 2: Cloud Platform (Render / Railway / Fly.io)
1. Push repository to GitHub.
2. Link the repository to your PaaS provider.
3. Configure Build Command: `npm install`
4. Configure Start Command: `node server/server.js`
5. Set Environment Variable: `PORT=5000` (or allow provider default)

---

## 🔒 Privacy & Safety Notice

- **No Patient Data Stored**: IntraCity tracks only aggregate facility resource counts (beds, blood units, vehicles, pipeline status). No individual patient identities, medical histories, or PHI (Protected Health Information) are collected or processed.
- **Emergency Disclaimer**: This platform serves as a coordination and discovery aid. In acute life-threatening situations, always contact national emergency services (**108** or **112**) or proceed to the nearest emergency room immediately.

---

## 📄 License

MIT License. Built for emergency response teams, public health coordinators, and civic hackathons.
