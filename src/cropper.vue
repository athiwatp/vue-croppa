<template>
  <div ref="wrapper"
       :class="`croppa-container ${img ? 'croppa--has-target' : ''} ${disabled ? 'croppa--disabled' : ''} ${disableClickToChoose ? 'croppa--disabled-cc' : ''} ${disableDragToMove && disableScrollToZoom ? 'croppa--disabled-mz' : ''} ${fileDraggedOver ? 'croppa--dropzone' : ''}`"
       @dragenter.stop.prevent="handleDragEnter"
       @dragleave.stop.prevent="handleDragLeave"
       @dragover.stop.prevent="handleDragOver"
       @drop.stop.prevent="handleDrop">
    <input type="file"
           :accept="accept"
           :disabled="disabled"
           ref="fileInput"
           @change="handleInputChange"
           style="height:1px;width:1px;overflow:hidden;margin-left:-99999px;position:absolute;" />
    <div class="slots"
         style="width: 0; height: 0; visibility: hidden;">
      <slot name="initial"></slot>
      <slot name="placeholder"></slot>
    </div>
    <canvas ref="canvas"
            @click.stop.prevent="handleClick"
            @touchstart.stop="handlePointerStart"
            @mousedown.stop.prevent="handlePointerStart"
            @pointerstart.stop.prevent="handlePointerStart"
            @touchend.stop.prevent="handlePointerEnd"
            @touchcancel.stop.prevent="handlePointerEnd"
            @mouseup.stop.prevent="handlePointerEnd"
            @pointerend.stop.prevent="handlePointerEnd"
            @pointercancel.stop.prevent="handlePointerEnd"
            @touchmove.stop="handlePointerMove"
            @mousemove.stop.prevent="handlePointerMove"
            @pointermove.stop.prevent="handlePointerMove"
            @DOMMouseScroll.stop="handleWheel"
            @wheel.stop="handleWheel"
            @mousewheel.stop="handleWheel"></canvas>
    <svg class="icon icon-remove"
         v-if="showRemoveButton && img"
         @click="remove"
         :style="`top: -${height/40}px; right: -${width/40}px`"
         viewBox="0 0 1024 1024"
         version="1.1"
         xmlns="http://www.w3.org/2000/svg"
         xmlns:xlink="http://www.w3.org/1999/xlink"
         :width="removeButtonSize || width/10"
         :height="removeButtonSize || width/10">
      <path d="M511.921231 0C229.179077 0 0 229.257846 0 512 0 794.702769 229.179077 1024 511.921231 1024 794.781538 1024 1024 794.702769 1024 512 1024 229.257846 794.781538 0 511.921231 0ZM732.041846 650.633846 650.515692 732.081231C650.515692 732.081231 521.491692 593.683692 511.881846 593.683692 502.429538 593.683692 373.366154 732.081231 373.366154 732.081231L291.761231 650.633846C291.761231 650.633846 430.316308 523.500308 430.316308 512.196923 430.316308 500.696615 291.761231 373.523692 291.761231 373.523692L373.366154 291.918769C373.366154 291.918769 503.453538 430.395077 511.881846 430.395077 520.349538 430.395077 650.515692 291.918769 650.515692 291.918769L732.041846 373.523692C732.041846 373.523692 593.447385 502.547692 593.447385 512.196923 593.447385 521.412923 732.041846 650.633846 732.041846 650.633846Z"
            :fill="removeButtonColor"></path>
    </svg>
  </div>
</template>

<script>
  import u from './util'
  import props from './props'
  import events from './events'

  const PCT_PER_ZOOM = 1 / 100000 // The amount of zooming everytime it happens, in percentage of image width.
  const MIN_MS_PER_CLICK = 500 // If touch duration is shorter than the value, then it is considered as a click.
  const CLICK_MOVE_THRESHOLD = 100 // If touch move distance is greater than this value, then it will by no mean be considered as a click.
  const MIN_WIDTH = 10 // The minimal width the user can zoom to.
  const DEFAULT_PLACEHOLDER_TAKEUP = 2 / 3 // Placeholder text by default takes up this amount of times of canvas width.
  const PINCH_ACCELERATION = 2 // The amount of times by which the pinching is more sensitive than the scolling
  // const DEBUG = false

  export default {
    model: {
      prop: 'value',
      event: 'init'
    },

    props: props,

    data () {
      return {
        instance: null,
        canvas: null,
        ctx: null,
        originalImage: null,
        img: null,
        dragging: false,
        lastMovingCoord: null,
        imgData: {},
        dataUrl: '',
        fileDraggedOver: false,
        tabStart: 0,
        pinching: false,
        pinchDistance: 0,
        supportTouch: false,
        pointerMoved: false,
        pointerStartCoord: null,
        naturalWidth: 0,
        naturalHeight: 0,
        scaleRatio: null,
        orientation: 1,
        userMetadata: null,
        imageSet: false
      }
    },

    computed: {
      realWidth () {
        return this.width * this.quality
      },

      realHeight () {
        return this.height * this.quality
      },

      realPlaceholderFontSize () {
        return this.placeholderFontSize * this.quality
      }
    },

    mounted () {
      this.init()
      u.rAFPolyfill()
      u.toBlobPolyfill()

      let supports = this.supportDetection()
      if (!supports.basic) {
        console.warn('Your browser does not support vue-croppa functionality.')
      }
    },

    watch: {
      value: function (val) {
        this.instance = val
      },
      realWidth: function () {
        if (!this.img) {
          this.init()
        } else {
          if (this.preventWhiteSpace) {
            this.imageSet = false
          }
          this.setSize()
          this.placeImage()
        }
      },
      realHeight: function () {
        if (!this.img) {
          this.init()
        } else {
          if (this.preventWhiteSpace) {
            this.imageSet = false
          }
          this.setSize()
          this.placeImage()
        }
      },
      canvasColor: function () {
        if (!this.img) {
          this.init()
        } else {
          this.draw()
        }
      },
      placeholder: function () {
        if (!this.img) {
          this.init()
        }
      },
      placeholderColor: function () {
        if (!this.img) {
          this.init()
        }
      },
      realPlaceholderFontSize: function () {
        if (!this.img) {
          this.init()
        }
      },
      preventWhiteSpace () {
        if (this.preventWhiteSpace) {
          this.imageSet = false
        }
        this.placeImage()
      }
    },

    methods: {
      init () {
        this.canvas = this.$refs.canvas
        this.setSize()
        this.canvas.style.backgroundColor = (!this.canvasColor || this.canvasColor == 'default') ? 'transparent' : (typeof this.canvasColor === 'string' ? this.canvasColor : '')
        this.ctx = this.canvas.getContext('2d')
        this.originalImage = null
        this.img = null
        this.setInitial()
        this.$emit(events.INIT_EVENT, {
          getCanvas: () => this.canvas,
          getContext: () => this.ctx,
          getChosenFile: () => this.$refs.fileInput.files[0],
          getActualImageSize: () => ({
            width: this.realWidth,
            height: this.realHeight
          }),
          moveUpwards: (amount) => {
            this.move({ x: 0, y: -amount })
          },
          moveDownwards: (amount) => {
            this.move({ x: 0, y: amount })
          },
          moveLeftwards: (amount) => {
            this.move({ x: -amount, y: 0 })
          },
          moveRightwards: (amount) => {
            this.move({ x: amount, y: 0 })
          },
          zoomIn: () => {
            this.zoom(true)
          },
          zoomOut: () => {
            this.zoom(false)
          },
          rotate: (step = 1) => {
            if (this.disableRotation || this.disabled) return
            step = parseInt(step)
            if (isNaN(step) || step > 3 || step < -3) {
              console.warn('Invalid argument for rotate() method. It should one of the integers from -3 to 3.')
              step = 1
            }
            this.rotateByStep(step)
          },
          flipX: () => {
            if (this.disableRotation || this.disabled) return
            this.rotate(2)
          },
          flipY: () => {
            if (this.disableRotation || this.disabled) return
            this.rotate(4)
          },
          refresh: () => {
            this.$nextTick(this.init)
          },
          hasImage: () => {
            return !!this.img
          },
          remove: this.remove,
          chooseFile: this.chooseFile,
          generateDataUrl: this.generateDataUrl,
          generateBlob: this.generateBlob,
          promisedBlob: this.promisedBlob,
          supportDetection: this.supportDetection,
          getMetadata: this.getMetadata,
          applyMetadata: (metadata) => {
            if (!metadata || !this.img) return
            this.userMetadata = metadata
            var ori = metadata.orientation || this.orientation || 1
            this.rotate(ori, true)
          }
        })
      },

      setSize () {
        this.canvas.width = this.realWidth
        this.canvas.height = this.realHeight
        this.canvas.style.width = this.width + 'px'
        this.canvas.style.height = this.height + 'px'
      },

      rotateByStep (step) {
        let orientation = 1
        switch (step) {
          case 1:
            orientation = 6
            break
          case 2:
            orientation = 3
            break
          case 3:
            orientation = 8
            break
          case -1:
            orientation = 8
            break
          case -2:
            orientation = 3
            break
          case -3:
            orientation = 6
            break
        }
        this.rotate(orientation)
      },

      supportDetection () {
        var div = document.createElement('div')
        return {
          'basic': window.requestAnimationFrame && window.File && window.FileReader && window.FileList && window.Blob,
          'dnd': 'ondragstart' in div && 'ondrop' in div
        }
      },

      remove () {
        let ctx = this.ctx
        this.paintBackground()

        this.setImagePlaceholder()
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        let defaultFontSize = this.realWidth * DEFAULT_PLACEHOLDER_TAKEUP / this.placeholder.length
        let fontSize = (!this.realPlaceholderFontSize || this.realPlaceholderFontSize == 0) ? defaultFontSize : this.realPlaceholderFontSize
        ctx.font = fontSize + 'px sans-serif'
        ctx.fillStyle = (!this.placeholderColor || this.placeholderColor == 'default') ? '#606060' : this.placeholderColor
        ctx.fillText(this.placeholder, this.realWidth / 2, this.realHeight / 2)

        let hadImage = this.img != null
        this.originalImage = null
        this.img = null
        this.$refs.fileInput.value = ''
        this.imgData = {}
        this.orientation = 1
        this.scaleRatio = null
        this.userMetadata = null
        this.imageSet = false

        if (hadImage) {
          this.$emit(events.IMAGE_REMOVE_EVENT)
        }
      },

      setImagePlaceholder () {
        let img
        if (this.$slots.placeholder && this.$slots.placeholder[0]) {
          let vNode = this.$slots.placeholder[0]
          let { tag, elm } = vNode
          if (tag == 'img' && elm) {
            img = elm
          }
        }

        if (!img) return

        var onLoad = () => {
          this.ctx.drawImage(img, 0, 0, this.realWidth, this.realHeight)
        }

        if (u.imageLoaded(img)) {
          onLoad()
        } else {
          img.onload = onLoad
        }
      },

      setInitial () {
        let src, img
        if (this.$slots.initial && this.$slots.initial[0]) {
          let vNode = this.$slots.initial[0]
          let { tag, elm } = vNode
          if (tag == 'img' && elm) {
            img = elm
          }
        }
        if (this.initialImage && typeof this.initialImage === 'string') {
          src = this.initialImage
          img = new Image()
          if (!/^data:/.test(src) && !/^blob:/.test(src)) {
            img.setAttribute('crossOrigin', 'anonymous')
          }
          img.src = src
        } else if (typeof this.initialImage === 'object' && this.initialImage instanceof Image) {
          img = this.initialImage
        }
        if (!src && !img) {
          this.remove()
          return
        }
        if (u.imageLoaded(img)) {
          this._onload(img, +img.dataset['exifOrientation'])
          this.$emit(events.INITIAL_IMAGE_LOADED_EVENT)
        } else {
          img.onload = () => {
            this._onload(img, +img.dataset['exifOrientation'])
            this.$emit(events.INITIAL_IMAGE_LOADED_EVENT)
          }

          img.onerror = () => {
            this.remove()
          }
        }
      },

      _onload (img, orientation = 1) {
        this.originalImage = img
        this.img = img

        if (isNaN(orientation)) {
          orientation = 1
        }

        this.rotate(orientation)
      },

      chooseFile () {
        this.$refs.fileInput.click()
      },

      handleClick () {
        if (!this.img && !this.disableClickToChoose && !this.disabled && !this.supportTouch) {
          this.chooseFile()
        }
      },

      handleInputChange () {
        let input = this.$refs.fileInput
        if (!input.files.length) return

        let file = input.files[0]
        this.onNewFileIn(file)
      },

      onNewFileIn (file) {
        this.$emit(events.FILE_CHOOSE_EVENT, file)
        if (!this.fileSizeIsValid(file)) {
          this.$emit(events.FILE_SIZE_EXCEED_EVENT, file)
          throw new Error('File size exceeds limit which is ' + this.fileSizeLimit + ' bytes.')
        }
        if (!this.fileTypeIsValid(file)) {
          this.$emit(events.FILE_TYPE_MISMATCH_EVENT, file)
          let type = file.type || file.name.toLowerCase().split('.').pop()
          throw new Error(`File type (${type}) does not match what you specified (${this.accept}).`)
        }
        if (typeof window.FileReader !== 'undefined') {
          let fr = new FileReader()
          fr.onload = (e) => {
            let fileData = e.target.result
            let orientation = u.getFileOrientation(u.base64ToArrayBuffer(fileData))
            if (orientation < 1) orientation = 1
            let img = new Image()
            img.src = fileData
            img.onload = () => {
              this._onload(img, orientation)
              this.$emit(events.NEW_IMAGE)
            }
          }
          fr.readAsDataURL(file)
        }
      },

      fileSizeIsValid (file) {
        if (!file) return false
        if (!this.fileSizeLimit || this.fileSizeLimit == 0) return true

        return file.size < this.fileSizeLimit
      },

      fileTypeIsValid (file) {
        let accept = this.accept || 'image/*'
        let baseMimetype = accept.replace(/\/.*$/, '')
        let types = accept.split(',')
        for (let i = 0, len = types.length; i < len; i++) {
          let type = types[i]
          let t = type.trim()
          if (t.charAt(0) == '.') {
            if (file.name.toLowerCase().split('.').pop() === t.toLowerCase().slice(1)) return true
          } else if (/\/\*$/.test(t)) {
            var fileBaseType = file.type.replace(/\/.*$/, '')
            if (fileBaseType === baseMimetype) {
              return true
            }
          } else if (file.type === type) {
            return true
          }
        }

        return false
      },

      placeImage (applyMetadata) {
        var imgData = this.imgData

        this.naturalWidth = this.img.naturalWidth
        this.naturalHeight = this.img.naturalHeight

        imgData.startX = u.numberValid(imgData.startX) ? imgData.startX : 0
        imgData.startY = u.numberValid(imgData.startY) ? imgData.startY : 0

        if (!this.imageSet) {
          if (this.initialSize == 'contain') {
            this.aspectFit()
          } else if (this.initialSize == 'natural') {
            this.naturalSize()
          } else {
            this.aspectFill()
          }
        } else if (u.numberValid(this.scaleRatio)) {
          imgData.width = this.naturalWidth * this.scaleRatio
          imgData.height = this.naturalHeight * this.scaleRatio
        } else {
          this.aspectFill()
        }
        this.scaleRatio = imgData.width / this.naturalWidth

        if (!this.imageSet) {
          if (/top/.test(this.initialPosition)) {
            imgData.startY = 0
          } else if (/bottom/.test(this.initialPosition)) {
            imgData.startY = this.realHeight - imgData.height
          }

          if (/left/.test(this.initialPosition)) {
            imgData.startX = 0
          } else if (/right/.test(this.initialPosition)) {
            imgData.startX = this.realWidth - imgData.width
          }

          if (/^-?\d+% -?\d+%$/.test(this.initialPosition)) {
            var result = /^(-?\d+)% (-?\d+)%$/.exec(this.initialPosition)
            var x = +result[1] / 100
            var y = +result[2] / 100
            imgData.startX = x * (this.realWidth - imgData.width)
            imgData.startY = y * (this.realHeight - imgData.height)
          }
        }

        applyMetadata && this.applyMetadata()

        if (this.preventWhiteSpace) {
          this.preventMovingToWhiteSpace()
        }

        if (!this.imageSet) {
          this.imageSet = true
        }

        this.draw()
      },

      aspectFill () {
        let imgWidth = this.naturalWidth
        let imgHeight = this.naturalHeight
        let imgRatio = imgHeight / imgWidth
        let canvasRatio = this.realHeight / this.realWidth
        let scaleRatio
        if (imgRatio < canvasRatio) {
          scaleRatio = imgHeight / this.realHeight
          this.imgData.width = imgWidth / scaleRatio
          this.imgData.height = this.realHeight
          this.imgData.startX = -(this.imgData.width - this.realWidth) / 2
          this.imgData.startY = 0
        } else {
          scaleRatio = imgWidth / this.realWidth
          this.imgData.height = imgHeight / scaleRatio
          this.imgData.width = this.realWidth
          this.imgData.startY = -(this.imgData.height - this.realHeight) / 2
          this.imgData.startX = 0
        }
      },

      aspectFit () {
        let imgWidth = this.naturalWidth
        let imgHeight = this.naturalHeight
        let imgRatio = imgHeight / imgWidth
        let canvasRatio = this.realHeight / this.realWidth
        let scaleRatio
        if (imgRatio < canvasRatio) {
          scaleRatio = imgWidth / this.realWidth
          this.imgData.height = imgHeight / scaleRatio
          this.imgData.width = this.realWidth
          this.imgData.startY = -(this.imgData.height - this.realHeight) / 2
        } else {
          scaleRatio = imgHeight / this.realHeight
          this.imgData.width = imgWidth / scaleRatio
          this.imgData.height = this.realHeight
          this.imgData.startX = -(this.imgData.width - this.realWidth) / 2
        }
      },

      naturalSize () {
        let imgWidth = this.naturalWidth
        let imgHeight = this.naturalHeight
        this.imgData.width = imgWidth
        this.imgData.height = imgHeight
        this.imgData.startX = -(this.imgData.width - this.realWidth) / 2
        this.imgData.startY = -(this.imgData.height - this.realHeight) / 2
      },

      handlePointerStart (evt) {
        this.supportTouch = true
        this.pointerMoved = false
        let pointerCoord = u.getPointerCoords(evt, this)
        this.pointerStartCoord = pointerCoord

        if (this.disabled) return
        // simulate click with touch on mobile devices
        if (!this.img && !this.disableClickToChoose) {
          this.tabStart = new Date().valueOf()
          return
        }
        // ignore mouse right click and middle click
        if (evt.which && evt.which > 1) return

        if (!evt.touches || evt.touches.length === 1) {
          this.dragging = true
          this.pinching = false
          let coord = u.getPointerCoords(evt, this)
          this.lastMovingCoord = coord
        }

        if (evt.touches && evt.touches.length === 2 && !this.disablePinchToZoom) {
          this.dragging = false
          this.pinching = true
          this.pinchDistance = u.getPinchDistance(evt, this)
        }

        let cancelEvents = ['mouseup', 'touchend', 'touchcancel', 'pointerend', 'pointercancel']
        for (let i = 0, len = cancelEvents.length; i < len; i++) {
          let e = cancelEvents[i]
          document.addEventListener(e, this.handlePointerEnd)
        }
      },

      handlePointerEnd (evt) {
        let pointerMoveDistance = 0
        if (this.pointerStartCoord) {
          let pointerCoord = u.getPointerCoords(evt, this)
          pointerMoveDistance = Math.sqrt(Math.pow(pointerCoord.x - this.pointerStartCoord.x, 2) + Math.pow(pointerCoord.y - this.pointerStartCoord.y, 2)) || 0
        }
        if (this.disabled) return
        if (!this.img && !this.disableClickToChoose) {
          let tabEnd = new Date().valueOf()
          if ((pointerMoveDistance < CLICK_MOVE_THRESHOLD) && tabEnd - this.tabStart < MIN_MS_PER_CLICK && this.supportTouch) {
            this.chooseFile()
          }
          this.tabStart = 0
          return
        }

        this.dragging = false
        this.pinching = false
        this.pinchDistance = 0
        this.lastMovingCoord = null
        this.pointerMoved = false
        this.pointerStartCoord = null
      },

      handlePointerMove (evt) {
        this.pointerMoved = true

        if (this.disabled || this.disableDragToMove || !this.img) return

        evt.preventDefault()
        if (!evt.touches || evt.touches.length === 1) {
          if (!this.dragging) return
          let coord = u.getPointerCoords(evt, this)
          if (this.lastMovingCoord) {
            this.move({
              x: coord.x - this.lastMovingCoord.x,
              y: coord.y - this.lastMovingCoord.y
            })
          }
          this.lastMovingCoord = coord
        }

        if (evt.touches && evt.touches.length === 2 && !this.disablePinchToZoom) {
          if (!this.pinching) return
          let distance = u.getPinchDistance(evt, this)
          let delta = distance - this.pinchDistance
          this.zoom(delta > 0, null, PINCH_ACCELERATION)
          this.pinchDistance = distance
        }
      },

      handleWheel (evt) {
        if (this.disabled || this.disableScrollToZoom || !this.img) return
        evt.preventDefault()
        let coord = u.getPointerCoords(evt, this)
        if (evt.wheelDelta < 0 || evt.deltaY > 0 || evt.detail > 0) {
          this.zoom(this.reverseScrollToZoom, coord)
        } else if (evt.wheelDelta > 0 || evt.deltaY < 0 || evt.detail < 0) {
          this.zoom(!this.reverseScrollToZoom, coord)
        }
      },

      handleDragEnter (evt) {
        if (this.disabled || this.disableDragAndDrop || this.img || !u.eventHasFile(evt)) return
        this.fileDraggedOver = true
      },

      handleDragLeave (evt) {
        if (!this.fileDraggedOver || !u.eventHasFile(evt)) return
        this.fileDraggedOver = false
      },

      handleDragOver (evt) {
      },

      handleDrop (evt) {
        if (!this.fileDraggedOver || !u.eventHasFile(evt)) return
        this.fileDraggedOver = false

        let file
        let dt = evt.dataTransfer
        if (!dt) return
        if (dt.items) {
          for (var i = 0, len = dt.items.length; i < len; i++) {
            let item = dt.items[i]
            if (item.kind == 'file') {
              file = item.getAsFile()
              break
            }
          }
        } else {
          file = dt.files[0]
        }

        if (file) {
          this.onNewFileIn(file)
        }
      },

      move (offset) {
        if (!offset) return
        let oldX = this.imgData.startX
        let oldY = this.imgData.startY
        this.imgData.startX += offset.x
        this.imgData.startY += offset.y
        if (this.preventWhiteSpace) {
          this.preventMovingToWhiteSpace()
        }
        if (this.imgData.startX !== oldX || this.imgData.startY !== oldY) {
          this.$emit(events.MOVE_EVENT)
          this.draw()
        }
      },

      preventMovingToWhiteSpace () {
        if (this.imgData.startX > 0) {
          this.imgData.startX = 0
        }
        if (this.imgData.startY > 0) {
          this.imgData.startY = 0
        }
        if (this.realWidth - this.imgData.startX > this.imgData.width) {
          this.imgData.startX = -(this.imgData.width - this.realWidth)
        }
        if (this.realHeight - this.imgData.startY > this.imgData.height) {
          this.imgData.startY = -(this.imgData.height - this.realHeight)
        }
      },

      zoom (zoomIn, pos, innerAcceleration = 1) {
        pos = pos || {
          x: this.imgData.startX + this.imgData.width / 2,
          y: this.imgData.startY + this.imgData.height / 2
        }
        let realSpeed = this.zoomSpeed * innerAcceleration
        let speed = (this.realWidth * PCT_PER_ZOOM) * realSpeed
        let x = 1
        if (zoomIn) {
          x = 1 + speed
        } else if (this.imgData.width > MIN_WIDTH) {
          x = 1 - speed
        }

        let oldWidth = this.imgData.width
        let oldHeight = this.imgData.height

        this.imgData.width = this.imgData.width * x
        this.imgData.height = this.imgData.height * x

        if (this.preventWhiteSpace) {
          if (this.imgData.width < this.realWidth) {
            let _x = this.realWidth / this.imgData.width
            this.imgData.width = this.realWidth
            this.imgData.height = this.imgData.height * _x
          }

          if (this.imgData.height < this.realHeight) {
            let _x = this.realHeight / this.imgData.height
            this.imgData.height = this.realHeight
            this.imgData.width = this.imgData.width * _x
          }
        }
        if (oldWidth.toFixed(2) !== this.imgData.width.toFixed(2) || oldHeight.toFixed(2) !== this.imgData.height.toFixed(2)) {
          let offsetX = (x - 1) * (pos.x - this.imgData.startX)
          let offsetY = (x - 1) * (pos.y - this.imgData.startY)
          this.imgData.startX = this.imgData.startX - offsetX
          this.imgData.startY = this.imgData.startY - offsetY

          if (this.preventWhiteSpace) {
            this.preventMovingToWhiteSpace()
          }
          this.$emit(events.ZOOM_EVENT)
          this.draw()
          this.scaleRatio = this.imgData.width / this.naturalWidth
        }
      },

      rotate (orientation = 6, useOriginal) {
        if (!this.img) return
        if (orientation > 1 || useOriginal) {
          var _img = u.getRotatedImage(useOriginal ? this.originalImage : this.img, orientation)
          _img.onload = () => {
            this.img = _img
            this.placeImage(useOriginal)
          }
        } else {
          this.placeImage()
        }

        if (orientation == 2) {
          // flip x
          this.orientation = u.flipX(this.orientation)
        } else if (orientation == 4) {
          // flip y
          this.orientation = u.flipY(this.orientation)
        } else if (orientation == 6) {
          // 90 deg
          this.orientation = u.rotate90(this.orientation)
        } else if (orientation == 3) {
          // 180 deg
          this.orientation = u.rotate90(u.rotate90(this.orientation))
        } else if (orientation == 8) {
          // 270 deg
          this.orientation = u.rotate90(u.rotate90(u.rotate90(this.orientation)))
        } else {
          this.orientation = orientation
        }

        if (useOriginal) {
          this.orientation = orientation
        }
      },

      paintBackground () {
        let backgroundColor = (!this.canvasColor || this.canvasColor == 'default') ? 'transparent' : this.canvasColor
        this.ctx.fillStyle = backgroundColor
        this.ctx.clearRect(0, 0, this.realWidth, this.realHeight)
        this.ctx.fillRect(0, 0, this.realWidth, this.realHeight)
      },

      draw () {
        if (!this.img) return
        if (window.requestAnimationFrame) {
          requestAnimationFrame(this._drawFrame)
        } else {
          this._drawFrame()
        }
      },

      _drawFrame () {
        let ctx = this.ctx
        let { startX, startY, width, height } = this.imgData

        this.paintBackground()
        ctx.drawImage(this.img, startX, startY, width, height)
        this.$emit(events.DRAW, ctx)
      },

      generateDataUrl (type, compressionRate) {
        if (!this.img) return ''
        return this.canvas.toDataURL(type, compressionRate)
      },

      generateBlob (callback, mimeType, qualityArgument) {
        if (!this.img) return null
        this.canvas.toBlob(callback, mimeType, qualityArgument)
      },

      promisedBlob (...args) {
        if (typeof Promise == 'undefined') {
          console.warn('No Promise support. Please add Promise polyfill if you want to use this method.')
          return
        }
        return new Promise((resolve, reject) => {
          try {
            this.generateBlob((blob) => {
              resolve(blob)
            }, args)
          } catch (err) {
            reject(err)
          }
        })
      },

      getMetadata () {
        if (!this.img) return {}
        let { startX, startY } = this.imgData

        return {
          startX,
          startY,
          scale: this.scaleRatio,
          orientation: this.orientation
        }
      },

      applyMetadata () {
        if (!this.userMetadata) return
        var { startX, startY, scale } = this.userMetadata

        if (u.numberValid(startX)) {
          this.imgData.startX = startX
        }

        if (u.numberValid(startY)) {
          this.imgData.startY = startY
        }

        if (u.numberValid(scale)) {
          this.imgData.width = this.naturalWidth * scale
          this.imgData.height = this.naturalHeight * scale
          this.scaleRatio = scale
        }
      }
    }
  }
</script>

<style lang="stylus">
  .croppa-container
    display: inline-block
    cursor: pointer
    transition: all .3s
    position: relative
    font-size: 0
    align-self: flex-start
    background-color: #e6e6e6
    canvas
      transition: all .3s
    &:hover
      opacity: .7
    &.croppa--dropzone
      box-shadow: inset 0 0 10px lightness(black, 20%)
      canvas
        opacity: .5
    &.croppa--disabled-cc
      cursor: default
      &:hover
        opacity: 1
    &.croppa--has-target
      cursor: move
      &:hover
        opacity: 1
      &.croppa--disabled-mz
        cursor: default
    &.croppa--disabled
      cursor: not-allowed
      &:hover
        opacity: 1
    svg.icon-remove
      position: absolute
      background: white
      border-radius: 50%
      filter: drop-shadow(-2px 2px 2px rgba(0, 0, 0, 0.7))
      z-index: 10
      cursor: pointer
      border: 2px solid white

</style>
