# Klar – Ausgaben-Tracker

Eine responsive, smartphone-optimierte Web-App zum Erfassen und Auswerten persönlicher Ausgaben.

## Starten

Die App benötigt keinen Build-Schritt und keine Abhängigkeiten. `index.html` kann direkt im Browser geöffnet werden. Alternativ lokal servieren:

```bash
python3 -m http.server 8000
```

Danach `http://localhost:8000` öffnen.

## Funktionen

- Ausgaben hinzufügen, suchen, filtern und löschen
- Ausgaben als monatlich, jährlich oder einmalig kennzeichnen
- Einnahmen mit eigenen Kategorien und allen Abrechnungsrhythmen erfassen
- Automatische monatliche und jährliche Wiederholungen ab dem Startdatum
- Eigene Kategorien für Einnahmen und Ausgaben mit frei wählbarer Farbe
- Getrennte Ansichten für Übersicht, Transaktionen und Auswertungen
- Monats- und Jahresfilter für die Buchungsansicht
- Einmalige Buchungen und wiederkehrende Serien bearbeiten
- Serienverwaltung mit zeitabhängigen Preisänderungen und gezielter Auswahl vergangener Buchungen
- Anpassbares Benutzerprofil mit Name und Initialen
- Passwortgeschützter JSON-Export und -Import mit AES-256-GCM
- AES-256-GCM-verschlüsselter lokaler Datenspeicher mit App-Sperre
- Geschütztes vollständiges Löschen aller lokal gespeicherten persönlichen Daten
- Selektives Löschen aller Buchungen eines Monats oder Jahres
- Monatliche und jährliche Salden aus Einnahmen und Ausgaben
- Sparbetrag und Sparquote in der Jahresauswertung
- Durchschnittliche Monatsausgaben für laufende und abgeschlossene Jahre
- Jahresbudgets und jährliche Sparziele mit Fortschrittsanzeige
- Separate Kategorieauswertungen für Einnahmen und Ausgaben
- Druckoptimierte Jahresauswertung
- Getrennte Summen und Filter für den Abrechnungsrhythmus
- Jahresauswertung mit allen zwölf Monaten, Jahressumme und Monatsdurchschnitt
- Kategorieverteilung und stärkster Ausgabenmonat pro Jahr
- Monatsbudget festlegen und Fortschritt verfolgen
- Automatische Auswertung nach Kategorien
- Responsive Desktop- und Smartphone-Navigation
- Persistenz im Browser über `localStorage`
