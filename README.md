# Meteor Atlas  — Where space meets Earth ☄️

## How to install?
First, download the .zip file from GitHub. Extract on your device, open `/Meteor-Madness/dist/`, and run `run_app.exe`. The rest should be working automatically.

## User guide
1. Choose a data input mode
    * **Manual mode**: Enter the meteor’s properties yourself (required: diameter, velocity, density; optional: name and entry angle).
    * **ID mode**: Provide a valid meteorite ID from an approved dataset (e.g., NASA). The app will fetch the meteor’s properties from that ID.

Use the Manual if you don’t have an ID. If you have access to the NASA database, enter the asteroid ID instead. 


2. Select the impact location
    * Pick one point on land within the United States (continental U.S. only, no oceans).
    * The map allows a single impact point; move or reselect it if needed.

3. Run the simulation
    * Click Simulate once the meteor data and impact point are set.
    * Review:
        * **Results panel** (outputs & units): The Results panel summarizes the inputs and key derived outputs. (meters, kilometers per second, kilograms per cubic meter).
            * **Mode:** `Manual` or `ID`
            * **Name (optional):** user-provided label
            * **Diameter:** meters (m)
            * **Velocity:** kilometers per second (km/s)
            * **Density:** kilograms per cubic meter (kg/m³)
            * **Location:** latitude, longitude in decimal degrees (°)
            * **Impact energy:** Mt TNT
            * **Crater diameter:** meters (m)
        * **Map view**: Spatial footprint for quick visual analysis.
            * **Energy:** total impact energy shown with an Mt TNT.
            * **Crater diameter:** estimated crater size in meters (with a **kilometer** readout when large).
            * **Concentric rings:** indicate pressure isobars (1, 3, 5, 10 psi) around the impact point for quick visual context.



## Summary
Meteor Atlas is an educational tool for the analysis of the impact of an asteroid across the continental U.S. — except for Hawaii, Alaska, and Puerto Rico.
Its goal is to make science and astrophysics understandable for the general public, by allowing users to explore how an asteroid's size, speed, and density determine the scale of an impact.


## What does this project do?
This project simulates the striking of an asteroid on US soil.  
Besides, it yields physical magnitudes like the kinetic energy produced, speed, density, location and crater radius.


## Motivation and Purpose of This Project
Our main goal is to help the general public in the United States understand the physics and real-world impact of an asteroid striking U.S. soil.  

How devastating could it be? How large would the affected area become?  
By visualizing these scenarios through an interactive simulation, we aim to make complex astrophysical concepts accessible and engaging for everyone — from students to enthusiasts of planetary science.

## Arquitechture 
* **Backend:** Python
* **Frontend:** JavaScript and HTML

## Authors and resources used:
### Use of the NASA Near-Earth Object (NEO) Web Service Application Programming Interface (API)



## Team members
* Alan Aguilar Corona
* Yamil Emiliano Carrillo Paniagua 
* Jafet Daniel Hernandez Rosas
* Pedro Solorio Rauda
* Joaquín Alejandro De Freitas Bello 
* Isaac Arturo Urrutia Alfaro
