const path = require('path');
const faceapi = require('@vladmandic/face-api');

async function loadModels() {
  const modelPath = path.resolve(__dirname, '../../models');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
}

module.exports = loadModels;
