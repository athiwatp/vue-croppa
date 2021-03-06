Number.isInteger = Number.isInteger || function (value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value
}

export default {
  value: Object,
  width: {
    type: Number,
    default: 200,
    validator: function (val) {
      return val > 0
    }
  },
  height: {
    type: Number,
    default: 200,
    validator: function (val) {
      return val > 0
    }
  },
  placeholder: {
    type: String,
    default: 'Choose an image'
  },
  placeholderColor: {
    default: '#606060'
  },
  placeholderFontSize: {
    type: Number,
    default: 0,
    validator: function (val) {
      return val >= 0
    }
  },
  canvasColor: {
    default: 'transparent'
  },
  quality: {
    type: Number,
    default: 2,
    validator: function (val) {
      return Number.isInteger(val) && val > 0
    }
  },
  zoomSpeed: {
    default: 3,
    type: Number,
    validator: function (val) {
      return val > 0
    }
  },
  accept: {
    type: String,
    default: '.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff'
  },
  fileSizeLimit: {
    type: Number,
    default: 0,
    validator: function (val) {
      return val >= 0
    }
  },
  disabled: Boolean,
  disableDragAndDrop: Boolean,
  disableClickToChoose: Boolean,
  disableDragToMove: Boolean,
  disableScrollToZoom: Boolean,
  disablePinchToZoom: Boolean,
  disableRotation: Boolean,
  reverseScrollToZoom: Boolean,
  preventWhiteSpace: Boolean,
  showRemoveButton: {
    type: Boolean,
    default: true
  },
  removeButtonColor: {
    type: String,
    default: 'red'
  },
  removeButtonSize: {
    type: Number
  },
  initialImage: [String, HTMLImageElement],
  initialSize: {
    type: String,
    default: 'cover',
    validator: function (val) {
      return val === 'cover' || val === 'contain' || val === 'natural'
    }
  },
  initialPosition: {
    type: String,
    default: 'center',
    validator: function (val) {
      var valids = [
        'center',
        'top',
        'bottom',
        'left',
        'right',
        'top left',
        'top right',
        'bottom left',
        'bottom right',
        'left top',
        'right top',
        'left bottom',
        'right bottom'
      ]
      return valids.indexOf(val) >= 0 || /^-?\d+% -?\d+%$/.test(val)
    }
  }
}