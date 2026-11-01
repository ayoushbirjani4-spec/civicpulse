# Prior-Work Analysis

| Platform / System | What It Does | What It Lacks (Limitations for CivicPulse) | Source / Reference |
| :--- | :--- | :--- | :--- |
| **Citizen Portal** | Allows citizens to log local complaints and track municipal grievances. | Lacks real-time spatial intelligence, automated pothole detection via computer vision, and open spatial mapping. | Government Citizen Portal Apps |
| **FixMyStreet** | Enables reporting of local infrastructural issues (potholes, streetlights) with location tags. | Limited automated classification (relies purely on manual descriptions/photos); lacks integrated PostGIS spatial clustering. | [FixMyStreet](https://www.fixmystreet.com/) |
| **SeeClickFix** | Crowdsourced civic issue reporting platform connecting residents and local governments. | Proprietary platform, lack of localized custom modules for regional road infrastructure analysis. | [SeeClickFix](https://seeclickfix.com/) |
| **Waze** | Real-time crowdsourced traffic and road hazard navigation app. | Focuses on drivers rather than municipal asset tracking or repair lifecycle management; lacks formal municipal grievance workflow. | [Waze](https://www.waze.com/) |
| **RDD2022** | Road Damage Detection dataset and benchmark model for automated pothole classification. | It is a static dataset and model rather than an end-to-end municipal tracking and citizen reporting web/mobile application. | [Road Damage Detection Challenge](https://github.com/sekilab/RoadDamageDetector) |