🧭 1. Données disponibles pour les maîtrises

Je t’ai classé les champs utilisables par source (table + champ logique pour les métriques JSON).

🗂️ Table activities
Catégorie	        Champ réel	            Nom de métrique pour condition.metric	            Description / calcul possible
📏 Distance	        distance_km	            distance_km	                                        Distance parcourue en km (total, moyenne, record)
🧗 Dénivelé	        elevation_m	            elevation_m	                                        Dénivelé positif total en m
⏱️ Durée	        moving_time_s	        duration_h, duration_h_max	                        Durée totale (ou max) en heures
🚴 Type	            sport_type	            rides_count, rides_type_road, rides_type_trainer	Compte d’activités selon le type
⚡ Puissance	       avg_watts, max_watts	   avg_power, max_power	                                Moyenne ou pic de puissance
❤️ Cardio	        avg_hr	                avg_hr	                                            Fréquence cardiaque moyenne
🦵 Cadence	        avg_cadence	            avg_cadence	                                        Moyenne des rotations/minute
💨 Vitesse	        avg_speed_kmh	        avg_speed_kmh	                                    Moyenne en km/h
📅 Date	            start_date	            rides_per_week, weeks_active	                    Activité par semaine / régularité
🔁 Entraînement	    trainer	                trainer_duration_h_max	                            Temps max sur home-trainer
🧘 Mental	        manual	                manual_rides_count	                                Nombre d’activités manuelles (hors capteur)
🏠 Appareil	        device_name	            device_diversity	                                Diversité d’appareils utilisés

🗺️ Table streams
Catégorie	         Champ réel	            Nom de métrique	                                    Description
⚡ Puissance	       watts	               max_watts, power_stability, zones_anaerobic	       Analyse fine des variations de puissance
❤️ Cardio	        heartrate	            max_hr, time_in_zone_3_4_5	                        Durée dans les zones d’intensité
🦵 Cadence	        cadence	                cadence_consistency	                                Variabilité de la cadence
🧗 Altitude	        altitude	            max_altitude, total_climbs	                        Plus haut sommet atteint, cumul montées
🧭 GPS	            latlng	                distance_unique, countries_count, segment_hits	    Variété géographique, passage sur zones spécifiques

🏔️ Table segments
Catégorie	        Champ réel	            Nom de métrique	                                    Description
🧗 Cols	            segment_id, name, average_grade	segment_id, segments_climbed	            Comptage ou détection de segments (ex. “Mont Ventoux”)
⚡ Performances	   distance_m, average_grade	climb_efficiency	                           Dénivelé par distance
📍 Géolocalisation	start_lat, start_lng	segment_location	                                Localisation d’un col spécifique

🧩 Données dérivées (calculées dans computeActivityStats())
Catégorie	                                Nom logique	                                        Description
🪶 distance_km_total	                    total distance	
⛰️ elevation_m_total	                    total élévation	
⏱️ duration_h_total	                        total heures	
🔁 rides	                                nombre de sorties	
🔥 avg_power_max	                        record puissance	
💨 avg_speed_max	                        record vitesse	
🗓️ weeks_active	                         nombre de semaines avec au moins une sortie	
🏋️ trainer_duration_h_max	                 plus longue session indoor	
🌍 countries_count	                        diversité géographique	
⚙️ device_diversity	                        nb. d’appareils différents utilisés	
🎯 segments_climbed	                        nb. de segments franchis (distincts)	
🧭 longest_ride_km	                        plus longue sortie	
🧘 rides_weekend_ratio	                    % de sorties samedi-dimanche	
🧩 avg_watts_per_kg	                        moyenne relative selon poids	
📈 consistency_score	                    régularité (écart type du volume hebdo)

🧠 2. Types de conditions disponibles

Ton champ condition en JSON peut utiliser :

{
  "metric": "distance_km",        // le champ de référence
  "thresholds": [100, 500, 1000], // les paliers de niveau
  "type": "total"                 // comment on calcule
}


Types possibles :

Type	    Description
total	    cumul de la valeur (distance totale, dénivelé cumulé)
record	    meilleure valeur unique atteinte
single_ride	évalue une activité isolée (par ex. plus de 150 km en une sortie)
average	    moyenne de la valeur sur toutes les sorties
geo	        comptage de zones ou pays uniques
streak	    régularité sur plusieurs semaines
trainer	    activités sur home-trainer
segment	    validation par passage sur un segment précis

dans metric, utiliser catégorie des dérivées ou sinon utiliser nom de métrique 

insert into masteries (name, category, icon, description, condition, source) values
('Coureur de fond', 'endurance', '🏃‍♂️', 'Accumule des kilomètres sur le long terme.',
 '{"metric": "distance_km", "thresholds": [100, 500, 1000, 5000, 10000], "type": "total"}', 'activities'),

('Grimpeur', 'endurance', '⛰️', 'Grimpe un total impressionnant de dénivelé positif.',
 '{"metric": "elevation_m", "thresholds": [1000, 5000, 10000, 25000, 50000], "type": "total"}', 'activities'),

('Sprinteur', 'explosivity', '⚡', 'Atteins des puissances maximales dignes des pros.',
 '{"metric": "max_power", "thresholds": [600, 800, 1000, 1200, 1400], "type": "record"}', 'streams'),

('Technicien', 'technique', '⚙️', 'Maintiens une cadence moyenne élevée sur tes sorties.',
 '{"metric": "avg_cadence", "thresholds": [75, 85, 95, 100], "type": "average"}', 'activities'),

('Régulier', 'strategy', '📅', 'Sors chaque semaine pendant plusieurs mois consécutifs.',
 '{"metric": "weeks_active", "thresholds": [2, 4, 8, 12, 20], "type": "streak"}', 'activities'),

('Découvreur', 'strategy', '🌍', 'Roule dans plusieurs pays différents.',
 '{"metric": "countries_count", "thresholds": [2, 4, 8, 12], "type": "geo"}', 'activities'),

('Stoïque', 'mental', '🧘', 'Tiens plus de 4h sur home-trainer.',
 '{"metric": "trainer_duration_h_max", "thresholds": [1, 2, 3, 4, 5], "type": "trainer"}', 'activities'),

('As du Ventoux', 'special', '🏔️', 'A conquis le légendaire Mont Ventoux.',
 '{"metric": "segment_id", "thresholds": [104236104], "type": "segment"}', 'segments');
