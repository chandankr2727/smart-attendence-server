import geolib from 'geolib';

export const geoService = {
    calculateDistance(point1, point2) {
        return geolib.getDistance(point1, point2);
    },

    isWithinRadius(userLocation, centerLocation, radius) {
        const distance = this.calculateDistance(userLocation, centerLocation);
        return distance <= radius;
    },

    validateCoordinates(lat, lng) {
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }
}; 