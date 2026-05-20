const ACTIVATION_API_URL = 'https://bernina-activation.kaushikmanian456.workers.dev';

function toggleStartDate() {
  const startDatePicker = document.getElementById('start-date-picker');
  const enableStartDate = document.getElementById('enable-start-date');

  startDatePicker.disabled = !enableStartDate.checked;
}

async function generateKey() {
  const generateButton = document.getElementById('generate-button');
  const startDatePicker = document.getElementById('start-date-picker');
  const expiryDatePicker = document.getElementById('date-picker');
  const passwordField = document.getElementById('password-field');
  const deviceLimitField = document.getElementById('device-limit-field');
  const enableStartDate = document.getElementById('enable-start-date');
  const licenseKeyDisplay = document.getElementById('license-key-display');
  const licenseKeyQR = document.getElementById('license-key-qr');
  const infoText = document.querySelector('#info p');

  const password = passwordField.value;
  if (!password) {
    setStatus('Enter the password.', true);
    return;
  }

  const maxDevices = Number(deviceLimitField.value);
  const expiresAt = dateInputToEpochSeconds(expiryDatePicker.value);
  const startAt = enableStartDate.checked && startDatePicker.value
    ? dateInputToEpochSeconds(startDatePicker.value)
    : null;

  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) {
    setStatus('Device limit must be between 1 and 100.', true);
    return;
  }

  if (!expiresAt) {
    setStatus('Choose an expiry date.', true);
    return;
  }

  if (startAt && startAt > expiresAt) {
    setStatus('Start date must be before the expiry date.', true);
    return;
  }

  generateButton.disabled = true;
  generateButton.textContent = 'Generating...';
  licenseKeyDisplay.textContent = 'Generating activation code...';
  licenseKeyQR.removeAttribute('src');
  setStatus('', false);

  try {
    const response = await fetch(`${ACTIVATION_API_URL}/activation-codes/from-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password,
        startAt,
        expiresAt,
        maxDevices,
        notes: 'github-pages-password-generator'
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(errorMessage(body.error, response.status));
    }

    const qrPayload = body.qrPayload || body.activationCode;
    await renderQRCode(qrPayload);

    licenseKeyDisplay.textContent = qrPayload;
    infoText.textContent = [
      `Created: ${formatEpoch(body.createdAt)}`,
      startAt ? `Starts: ${formatEpoch(startAt)}` : 'Starts: immediately',
      `Expires: ${formatEpoch(expiresAt)}`,
      `Device limit: ${body.maxDevices || maxDevices}`,
      `Status: 0/${body.maxDevices || maxDevices} used`
    ].join(' | ');
    setStatus(successMessage(body.maxDevices || maxDevices), false);
  } catch (error) {
    licenseKeyDisplay.textContent = 'Unable to generate activation code';
    setStatus(error.message, true);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = 'Generate Activation QR Code';
  }
}

function handleStartDateChange() {
  const startDatePicker = document.getElementById('start-date-picker');
  const endDatePicker = document.getElementById('date-picker');

  endDatePicker.min = startDatePicker.value;

  if (endDatePicker.value < startDatePicker.value) {
    endDatePicker.value = startDatePicker.value;
  }
}

function handleEndDateChange() {
  const startDatePicker = document.getElementById('start-date-picker');
  const endDatePicker = document.getElementById('date-picker');

  if (startDatePicker.value && endDatePicker.value < startDatePicker.value) {
    endDatePicker.value = startDatePicker.value;
  }
}

function dateInputToEpochSeconds(value) {
  if (!value) {
    return null;
  }

  return Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 1000);
}

function formatEpoch(value) {
  if (!value) {
    return '-';
  }

  return new Date(value * 1000).toISOString().slice(0, 10);
}

function renderQRCode(value) {
  const licenseKeyQR = document.getElementById('license-key-qr');

  return new Promise((resolve, reject) => {
    if (!window.qrcode) {
      reject(new Error('QR library failed to load.'));
      return;
    }

    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      licenseKeyQR.src = qr.createDataURL(8, 2);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function setStatus(message, isError) {
  const status = document.getElementById('status-message');
  status.textContent = message;
  status.className = isError ? 'error-message' : 'success-message';
}

function errorMessage(error, status) {
  if (error === 'wrong_password') {
    return 'Wrong password.';
  }

  if (error === 'not_found') {
    return 'Activation API is not deployed with password-based generation yet.';
  }

  return error || `Request failed with HTTP ${status}`;
}

function successMessage(maxDevices) {
  if (maxDevices === 1) {
    return 'Activation QR code generated. It will lock to the first iPad that redeems it.';
  }

  return `Activation QR code generated. It will lock after ${maxDevices} iPads redeem it.`;
}

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);

  const startDatePicker = document.getElementById('start-date-picker');
  const endDatePicker = document.getElementById('date-picker');

  const todayString = today.toISOString().split('T')[0];
  startDatePicker.value = todayString;
  startDatePicker.min = todayString;
  endDatePicker.min = todayString;
  endDatePicker.value = nextMonth.toISOString().split('T')[0];

  document.getElementById('license-key-display').textContent = 'Generate an activation code';
});
