import Component from "@egjs/component";
import {
	DeviceMotionEvent
} from "./browser";

import {YawPitchControl} from "../YawPitchControl";
import {PanoImageRenderer} from "../PanoImageRenderer";
import WebGLUtils from "../PanoImageRenderer/WebGLUtils";
import {ERROR_TYPE, EVENTS, GYRO_MODE, PROJECTION_TYPE} from "./consts";
import {glMatrix} from "../utils/math-util.js";

export default class PanoViewer extends Component {
	/**
	 * @classdesc 360 media viewer
	 * @ko 360 미디어 뷰어
	 * @class
	 * @name eg.view360.PanoViewer
	 * @extends eg.Component
	 *
	 * @param {HTMLElement} container The container element for the renderer. <ko>렌더러의 컨테이너 엘리먼트</ko>
	 * @param {Object} config
	 *
	 * @param {String|Image} config.image Input image url or element<ko>입력 이미지 URL 혹은 엘리먼트(image 와 video 둘 중 하나만 설정한다.)</ko>
	 * @param {String|HTMLVideoElement} config.video Input video url or element<ko>입력 비디오 URL 혹은 엘리먼트(image 와 video 둘 중 하나만 설정한다.)</ko>
	 * @param {String} [config.projectionType=equirectangular] The type of projection: equirectangular, cubemap <ko>Projection 유형 : equirectangular, cubemap</ko>
	 * @param {Object} config.cubemapConfig config cubemap projection layout. <ko>cubemap projection type 의 레이아웃을 설정한다.</ko>
	 * @param {Number} [config.width=width of container] the viewer's width. (in px) <ko>뷰어의 너비 (px 단위)</ko>
	 * @param {Number} [config.height=height of container] the viewer's height.(in px) <ko>뷰어의 높이 (px 단위)</ko>
	 *
	 * @param {Number} [config.yaw=0] Initial Yaw of camera (in degree) <ko>카메라의 초기 Yaw (degree 단위)</ko>
	 * @param {Number} [config.pitch=0] Initial Pitch of camera (in degree) <ko>카메라의 초기 Pitch (degree 단위)</ko>
	 * @param {Number} [config.fov=65] Initial vertical field of view of camera (in degree) <ko>카메라의 초기 수직 field of view (degree 단위)</ko>
	 * @param {Boolean} [config.showPolePoint=false] If false, the pole is not displayed inside the viewport <ko>false 인 경우, 극점은 뷰포트 내부에 표시되지 않습니다</ko>
	 * @param {Boolean} [config.useZoom=true] When true, enables zoom with the wheel and Pinch gesture <ko>true 일 때 휠 및 집기 제스춰로 확대 / 축소 할 수 있습니다.</ko>
	 * @param {Boolean} [config.useKeyboard=true] When true, enables the keyboard move key control: awsd, arrow keys <ko>true 이면 키보드 이동 키 컨트롤을 활성화합니다: awsd, 화살표 키</ko>
	 * @param {String} [config.useGyro=yawPitch] Enables control through device motion. ("none", "yawPitch") <ko>디바이스 움직임을 통한 컨트롤을 활성화 합니다. ("none", "yawPitch") </ko>
	 * @param {Array} [config.yawRange=[-180, 180]] Range of controllable Yaw values <ko>제어 가능한 Yaw 값의 범위</ko>
	 * @param {Array} [config.pitchRange=[-90, 90]] Range of controllable Pitch values <ko>제어 가능한 Pitch 값의 범위</ko>
	 * @param {Array} [config.fovRange=[30, 110]] Range of controllable vertical field of view values <ko>제어 가능한 수직 field of view 값의 범위</ko>
	 */
	constructor(container, options = {}) {
		super();

		// Raises the error event if webgl is not supported.
		if (!WebGLUtils.isWebGLAvailable()) {
			setTimeout(() => {
				this.trigger(EVENTS.ERROR, {
					type: ERROR_TYPE.NO_WEBGL,
					message: "no webgl support"
				});
			}, 0);
			return this;
		}

		if (!WebGLUtils.isStableWebGL()) {
			setTimeout(() => {
				this.trigger(EVENTS.ERROR, {
					type: ERROR_TYPE.INVALID_DEVICE,
					message: "blacklisted browser"
				});
			}, 0);

			return this;
		}

		if (!!options.image && !!options.video) {
			setTimeout(() => {
				this.trigger(EVENTS.ERROR, {
					type: ERROR_TYPE.INVALID_RESOURCE,
					message: "Specifying multi resouces(both image and video) is not valid."
				});
			}, 0);
			return this;
		}

		this._container = container;
		this._image = options.image || options.video;
		this._isVideo = !!options.video;
		this._projectionType = options.projectionType || PROJECTION_TYPE.EQUIRECTANGULAR;
		this._cubemapConfig = Object.assign({
			order: "RLUDBF",
			tileConfig: {
				flipHirozontal: false,
				rotation: 0
			}
		}, options.cubemapConfig);

		// If the width and height are not provided, will use the size of the container.
		this._width = options.width || parseInt(window.getComputedStyle(container).width, 10);
		this._height = options.height || parseInt(window.getComputedStyle(container).height, 10);

		this._yaw = options.yaw || 0;
		this._pitch = options.pitch || 0;
		this._fov = options.fov || 65;

		this._useGyro = options.useGyro || GYRO_MODE.YAWPITCH;

		this._aspectRatio = this._width / this._height;
		const fovRange = options.fovRange || [30, 110];

		const yawPitchConfig = Object.assign(options, {
			element: container,
			yaw: this._yaw,
			pitch: this._pitch,
			fov: this._fov,
			useGyro: this._useGyro,
			fovRange,
			aspectRatio: this._aspectRatio,
		});

		this._isReady = false;

		this._initYawPitchControl(yawPitchConfig);
		this._initRenderer(this._yaw, this._pitch, this._fov, this._projectionType, this._cubemapConfig);
	}

	/**
		* Getting the video element that the viewer is currently playing. You can use this for playback.
		* @ko 뷰어가 현재 사용 중인 비디오 요소를 얻습니다. 이 요소를 이용해 비디오의 컨트롤을 할 수 있습니다.
		* @method eg.view360.PanoViewer#getVideo
		* @return {HTMLVideoElement} HTMLVideoElement<ko>HTMLVideoElement</ko>
		*/
	getVideo() {
		if (!this._isVideo) {
			return null;
		}

		return this._photoSphereRenderer.getContent();
	}

	/**
	 * Setting the video information to be used by the viewer.
	 * @ko 뷰어가 사용할 이미지 정보를 설정 합니다.
	 * @method eg.view360.PanoViewer#setVideo
	 * @param {String|HTMLVideoElement|Object} video Input video url or element or config object<ko>입력 비디오 URL 혹은 엘리먼트 혹은 설정객체를 활용(image 와 video 둘 중 하나만 설정한다.)</ko>
	 * @param {Object} param
	 * @param {String} [param.projectionType="equirectangular"] Projection Type<ko>프로젝션 타입</ko>
	 * @param {Object} param.cubemapConfig config cubemap projection layout. <ko>cubemap projection type 의 레이아웃을 설정한다.</ko>
	 *
	 * @return {PanoViewer} PanoViewer instance<ko>PanoViewer 인스턴스</ko>
	 */
	setVideo(video, param = {}) {
		if (!video) {
			return this;
		}

		this.setImage(
			video,
			{
				projectionType: param.projectionType,
				isVideo: true,
				cubemapConfig: param.cubemapConfig
			}
		);
		return this;
	}

	/**
	 * Getting the image information that the viewer is currently using.
	 * @ko 뷰어가 현재 사용하고있는 이미지 정보를 얻습니다.
	 * @method eg.view360.PanoViewer#getImage
	 * @return {Image} Image Object<ko>이미지 객체</ko>
	 */
	getImage() {
		if (this._isVideo) {
			return null;
		}

		return this._photoSphereRenderer.getContent();
	}

	/**
	 * Setting the image information to be used by the viewer.
	 * @ko 뷰어가 사용할 이미지 정보를 설정 합니다.
	 * @method eg.view360.PanoViewer#setImage
	 * @param {String|Image|Object} image Input image url or element or config object<ko>입력 이미지 URL 혹은 엘리먼트 혹은 설정객체를 활용(image 와 video 둘 중 하나만 설정한다.)</ko>
	 * @param {Object} param Additional information<ko>이미지 추가 정보</ko>
	 * @param {String} [param.projectionType="equirectangular"] Projection Type<ko>프로젝션 타입</ko>
	 * @param {Object} param.cubemapConfig config cubemap projection layout. <ko>cubemap projection type 의 레이아웃을 설정한다.</ko>
	 *
	 * @return {PanoViewer} PanoViewer instance<ko>PanoViewer 인스턴스</ko>
	 */
	setImage(image, param = {}) {
		const cubemapConfig = Object.assign({
			order: "RLUDBF",
			tileConfig: {
				flipHirozontal: false,
				rotation: 0
			}
		}, param.cubemapConfig);
		const isVideo = !!(param.isVideo);

		if (this._image && this._isVideo !== isVideo) {
			/* eslint-disable no-console */
			console.warn("Currently not supporting to change content type(Image <--> Video)");
			/* eslint-enable no-console */
			return this;
		}

		if (!image) {
			return this;
		}

		this._image = image;
		this._isVideo = isVideo;
		this._projectionType = param.projectionType || PROJECTION_TYPE.EQUIRECTANGULAR;
		this._cubemapConfig = cubemapConfig;

		this._deactivate();
		this._initRenderer(this._yaw, this._pitch, this._fov, this._projectionType, this._cubemapConfig);

		return this;
	}

	keepUpdate(doUpdate) {
		this._photoSphereRenderer.keepUpdate(doUpdate);
		return this;
	}

	/**
	 * Get projection type (equirectangular/cube)
	 * @ko 프로젝션 타입(Equirectangular 혹은 Cube)을 반환한다.
	 *
	 * @method eg.view360.PanoViewer#getProjectionType
	 */
	getProjectionType() {
		return this._projectionType;
	}

	_initRenderer(yaw, pitch, fov, projectionType, cubemapConfig) {
		this._photoSphereRenderer = new PanoImageRenderer(
			this._image,
			this._width,
			this._height,
			this._isVideo,
			{
				initialYaw: yaw,
				initialPitch: pitch,
				fieldOfView: fov,
				imageType: projectionType,
				cubemapConfig
			}
		);

		this._bindRendererHandler();

		this._photoSphereRenderer
			.bindTexture()
			.then(() => this._activate())
			.catch(() => {
				this._triggerEvent(EVENTS.ERROR, {
					type: ERROR_TYPE.FAIL_BIND_TEXTURE,
					message: "failed to bind texture"
				});
			});
	}

	_bindRendererHandler() {
		this._photoSphereRenderer.on(PanoImageRenderer.EVENTS.IMAGE_LOADED, e => {
			this.trigger(EVENTS.CONTENT_LOADED, e);
		});

		this._photoSphereRenderer.on(PanoImageRenderer.EVENTS.ERROR, e => {
			this.trigger(EVENTS.ERROR, e);
		});

		this._photoSphereRenderer.on(PanoImageRenderer.EVENTS.RENDERING_CONTEXT_LOST, e => {
			this._deactivate();
			this.trigger(EVENTS.ERROR, {
				type: ERROR_TYPE.RENDERING_CONTEXT_LOST,
				message: "webgl rendering context lost"
			});
		});
	}

	_initYawPitchControl(yawPitchConfig) {
		this._yawPitchControl = new YawPitchControl(yawPitchConfig);

		this._yawPitchControl.on(EVENTS.ANIMATION_END, e => {
			this._triggerEvent(EVENTS.ANIMATION_END, e);
		});

		this._yawPitchControl.on("change", e => {
			this._yaw = e.yaw;
			this._pitch = e.pitch;
			this._fov = e.fov;

			this._triggerEvent(EVENTS.VIEW_CHANGE, e);
		});
	}

	_triggerEvent(name, param) {
		const evt = param || {};

		/**
		 * Events that is fired when error occurs
		 * @ko 에러 발생 시 발생하는 이벤트
		 * @name eg.view360.PanoViewer#error
		 * @event
		 * @param {Object} param The object of data to be sent to an event <ko>이벤트에 전달되는 데이터 객체</ko>
		 * @param {Number} param.type Error type
		 * 		10: INVALID_DEVICE: Unsupported device
		 * 		11: NO_WEBGL: Webgl not support
		 * 		12, FAIL_IMAGE_LOAD: Failed to load image
		 * 		13: FAIL_BIND_TEXTURE: Failed to bind texture
		 * 		14: INVALID_RESOURCE: Only one resource(image or video) should be specified
		 * 		15: RENDERING_CONTEXT_LOST: WebGL context lost occurred
		 * <ko>에러 종류
		 * 		10: INVALID_DEVICE: 미지원 기기
		 * 		11: NO_WEBGL: WEBGL 미지원
		 * 		12, FAIL_IMAGE_LOAD: 이미지 로드 실패
		 * 		13: FAIL_BIND_TEXTURE: 텍스쳐 바인딩 실패
		 * 		14: INVALID_RESOURCE: 리소스 지정 오류 (image 혹은 video 중 하나만 지정되어야 함)
		 * 		15: RENDERING_CONTEXT_LOST: WebGL context lost 발생
		 * </ko>
		 * @param {String} param.message Error message <ko>에러 메시지</ko>
		 *
		 * @example
		 *
		 * viwer.on({
		 *	"error" : function(evt) {
		 *		// evt.type === 13
		 *		// evt.messaeg === "failed to bind texture"
		 * });
		 */

		/**
		 * Events that is fired when PanoViewer is ready to go.
		 * @ko PanoViewer 가 준비된 상태에 발생하는 이벤트
		 * @name eg.view360.PanoViewer#ready
		 * @event
		 *
		 * @example
		 *
		 * viwer.on({
		 *	"ready" : function(evt) {
		 *		// PanoViewer is ready to show image and handle user interaction.
		 * });
		 */

		/**
		 * Events that is fired when direction or fov is changed.
		 * @ko PanoViewer 에서 바라보고 있는 방향이나 FOV(화각)가 변경되었을때 발생하는 이벤트
		 * @name eg.view360.PanoViewer#viewChange
		 * @event
		 * @param {Object} param The object of data to be sent to an event <ko>이벤트에 전달되는 데이터 객체</ko>
		 * @param {Number} param.yaw yaw<ko>yaw</ko>
		 * @param {Number} param.pitch pitch <ko>pitch</ko>
		 * @param {Number} param.fov Field of view (fov) <ko>화각</ko>
		 * @example
		 *
		 * viwer.on({
		 *	"viewChange" : function(evt) {
		 *		//evt.yaw, evt.pitch, evt.fov is available.
		 * });
		 */

		/**
		 * Events that is fired when animation which is triggered by inertia is ended.
		 * @ko 관성에 의한 애니메이션 동작이 완료되었을때 발생하는 이벤트
		 * @name eg.view360.PanoViewer#animationEnd
		 * @event
		 * @example
		 *
		 * viwer.on({
		 *	"animationEnd" : function(evt) {
		 *		// animation is ended.
		 * });
		 */

		/**
			* Events that is fired when content(Video/Image) is loaded
			* @ko 컨텐츠(비디오 혹은 이미지)가 로드되었을때 발생되는 이벤트
			*
			* @name eg.view360.PanoViewer#contentLoaded
			* @event
			* @param {Object} event
			* @param {HTMLVideoElement|Image} event.content
			* @param {Boolean} event.isVideo
			* @param {String} event.projectionType
			*/
		return this.trigger(name, evt);
	}

	/**
	 * When set true, enables zoom with the wheel and Pinch gesture
	 * @ko true 로 설정 시 휠 및 집기 동작으로 확대 / 축소 할 수 있습니다.
	 * @method eg.view360.PanoViewer#setUseZoom
	 * @param {Boolean} useZoom
	 */
	setUseZoom(useZoom) {
		if (typeof useZoom !== "boolean") {
			return;
		}

		this._yawPitchControl.option("useZoom", useZoom);
	}

	/**
	 * When true, enables the keyboard move key control: awsd, arrow keys
	 * @ko true이면 키보드 이동 키 컨트롤을 활성화합니다. (awsd, 화살표 키)
	 * @method eg.view360.PanoViewer#setUseKeyboard
	 * @param {Boolean} useKeyboard
	 */
	setUseKeyboard(useKeyboard) {
		this._yawPitchControl.option("useKeyboard", useKeyboard);
	}

	/**
	 * Enables control through device motion. ("none", "yawPitch")
	 * @ko 디바이스 움직임을 통한 컨트롤을 활성화 합니다. ("none", "yawPitch")
	 * @method eg.view360.PanoViewer#setUseGyro
	 * @param {String} useGyro
	 */
	setUseGyro(useGyro) {
		this._yawPitchControl.option("useGyro", useGyro);
	}

	/**
	 * Setting the range of controllable FOV values
	 * @ko 제어 가능한 FOV 값의 범위 설정
	 * @method eg.view360.PanoViewer#setFovRange
	 * @param {Array} range
	 */
	setFovRange(range) {
		this._yawPitchControl.option("fovRange", range);
	}

	/**
	 * Getting the range of controllable FOV values
	 * @ko 제어 가능한 FOV 값의 범위 가져 오기
	 * @method eg.view360.PanoViewer#getFovRange
	 * @return {Array}
	 */
	getFovRange() {
		return this._yawPitchControl.option("fovRange");
	}

	/**
	 * Update size of canvas element by it's container element's or specified size.
	 * @ko 캔버스 엘리먼트의 크기를 컨테이너 엘리먼트의 크기나 지정된 크기로 업데이트합니다.
	 * @method eg.view360.PanoViewer#updateViewportDimensions
	 * @param {Object} [size]
	 * @param {Number} [size.width=width of container]
	 * @param {Number} [size.height=height of container]
	 */
	updateViewportDimensions(size) {
		if (!this._isReady) {
			return;
		}
		this._width = (size && size.width) ||
			parseInt(window.getComputedStyle(this._container).width, 10);
		this._height = (size && size.height) ||
									parseInt(window.getComputedStyle(this._container).height, 10);
		this._aspectRatio = this._width / this._height;
		this._photoSphereRenderer.updateViewportDimensions(this._width, this._height);
		this._yawPitchControl.option("aspectRatio", this._aspectRatio);

		this.lookAt({}, 0);
	}

	/**
	 * Get the vertical field of view
	 * @ko 뷰어의 수직 field of view 값을 가져옵니다.
	 * @method eg.view360.PanoViewer#getFov
	 * @return {Number}
	 */
	getFov() {
		return this._fov;
	}

	/**
	 * Get the horizontal field of view in degree
	 */
	_getHFov() {
		return glMatrix.toDegree(
			2 * Math.atan(this._aspectRatio * Math.tan(glMatrix.toRadian(this._fov) / 2)));
	}

	/**
	 * Get current yaw value
	 * @ko 뷰어의 yaw 값을 가져옵니다.
	 * @method eg.view360.PanoViewer#getYaw
	 * @return {Number}
	 */
	getYaw() {
		return this._yaw;
	}

	/**
	 * Get current pitch value
	 * @ko 뷰어의 pitch 값을 가져옵니다.
	 * @method eg.view360.PanoViewer#getPitch
	 * @return {Number}
	 */
	getPitch() {
		return this._pitch;
	}

	/**
	 * Get the range of controllable Yaw values
	 * @ko 컨트롤 가능한 Yaw 구간을 가져옵니다.
	 * @method eg.view360.PanoViewer#getYawRange
	 * @return {Array}
	 */
	getYawRange() {
		return this._yawPitchControl.option("yawRange");
	}

	/**
	 * Get the range of controllable Pitch values
	 * @ko 컨트롤 가능한 Pitch 구간을 가져옵니다.
	 * @method eg.view360.PanoViewer#getPitchRange
	 * @return {Array}
	 */
	getPitchRange() {
		return this._yawPitchControl.option("pitchRange");
	}

	/**
	 * Set the range of controllable Yaw values
	 * @ko 컨트롤 가능한 Yaw 구간을 설정합니다.
	 * @method eg.view360.PanoViewer#setYawRange
	 * @param {Array} range
	 */
	setYawRange(yawRange) {
		return this._yawPitchControl.option("yawRange", yawRange);
	}

	/**
	 * Set the range of controllable Pitch values
	 * @ko 컨트롤 가능한 Pitch 구간을 설정합니다.
	 * @method eg.view360.PanoViewer#setPitchRange
	 * @param {Array} range
	 */
	setPitchRange(pitchRange) {
		return this._yawPitchControl.option("pitchRange", pitchRange);
	}

	/**
	 * If false, the pole is not displayed inside the viewport
	 * @ko false 인 경우, 폴은 뷰포트 내부에 표시되지 않습니다.
	 * @method eg.view360.PanoViewer#setPitchRange
	 * @param {Boolean} showPolePoint
	 */
	setShowPolePoint(showPolePoint) {
		return this._yawPitchControl.option("showPolePoint", showPolePoint);
	}

	/**
	 * Set a new view by setting camera configuration. Any parameters not specified remain the same.
	 * @ko 카메라 설정을 지정하여 화면을 갱신합니다. 지정되지 않은 매개 변수는 동일하게 유지됩니다.
	 * @method eg.view360.PanoViewer#lookAt
	 * @param {Object} orientation
	 * @param {Number} orientation.yaw Target yaw in degree <ko>목표 yaw (degree 단위)</ko>
	 * @param {Number} orientation.pitch Target pitch in degree <ko>목표 pitch (degree 단위)</ko>
	 * @param {Number} orientation.fov Target vertical fov in degree <ko>목표 수직 fov (degree 단위)</ko>
	 * @param {Number} duration Animation duration in milliseconds <ko>애니메이션 시간 (밀리 초)</ko>
	 */
	lookAt(orientation, duration) {
		if (!this._isReady) {
			return;
		}

		const yaw = orientation.yaw !== undefined ? orientation.yaw : this._yaw;
		const pitch = orientation.pitch !== undefined ? orientation.pitch : this._pitch;
		const pitchRange = this._yawPitchControl.option("pitchRange");
		const verticalAngleOfImage = pitchRange[1] - pitchRange[0];
		let fov = orientation.fov !== undefined ? orientation.fov : this._fov;

		if (verticalAngleOfImage < fov) {
			fov = verticalAngleOfImage;
		}

		this._yawPitchControl.lookAt({yaw, pitch, fov}, duration);

		if (duration === 0) {
			this._photoSphereRenderer.render(yaw, pitch, fov);
		}
	}

	_activate() {
		this._photoSphereRenderer.attachTo(this._container);
		this._yawPitchControl.enable();

		this.updateViewportDimensions();

		this._isReady = true;
		this._triggerEvent(EVENTS.READY);
		this._startRender();
	}

	/**
	 * Register the callback on the raf to call _renderLoop every frame.
	 */
	_startRender() {
		this._renderLoop = this._renderLoop.bind(this);
		this._rafId = window.requestAnimationFrame(this._renderLoop);
	}

	_renderLoop() {
		if (this._photoSphereRenderer) {
			this._photoSphereRenderer.render(this._yaw, this._pitch, this._fov);
		}
		this._rafId = window.requestAnimationFrame(this._renderLoop);
	}

	_stopRender() {
		if (this._rafId) {
			window.cancelAnimationFrame(this._rafId);
			delete this._rafId;
		}
	}

	/**
	 * Destroy webgl context and block user interaction and stop rendering
	 */
	_deactivate() {
		if (this._photoSphereRenderer) {
			this._photoSphereRenderer.destroy();
			this._photoSphereRenderer = null;
		}

		if (this._isReady) {
			this._yawPitchControl.disable();
			this._stopRender();
			this._isReady = false;
		}
	}

	/**
	 * Destroy viewer. Remove all registered event listeners and remove viewer canvas.
	 * @ko 뷰어 인스턴스를 해제합니다. 모든 등록된 이벤트리스너를 제거하고 뷰어 캔버스를 삭제한다.
	 * @method eg.view360.PanoViewer#destroy
	 */
	destroy() {
		this._deactivate();

		if (this._yawPitchControl) {
			this._yawPitchControl.destroy();
			this._yawPitchControl = null;
		}

		if (this._photoSphereRenderer) {
			this._photoSphereRenderer.destroy();
			this._photoSphereRenderer = null;
		}

		this._isReady = false;
	}

	static isWebGLAvailable() {
		return WebGLUtils.isWebGLAvailable();
	}

	/**
	 * Check whether the current environment supports the gyro sensor.
	 * @ko 현재 브라우저 환경이 자이로 센서를 지원하는지 여부를 확인합니다.
	 * @function isGyroSensorAvailable
	 * @memberof eg.view360.PanoViewer
	 * @param {Function} callback Function to take the gyro sensor availability as argument <ko>자이로 센서를 지원하는지 여부를 인자로 받는 함수</ko>
	 * @static
	 */
	static isGyroSensorAvailable(callback) {
		if (!DeviceMotionEvent) {
			callback && callback(false);
			return;
		}

		let onDeviceMotionChange;

		function checkGyro() {
			return new Promise((res, rej) => {
				onDeviceMotionChange = function(deviceMotion) {
					const isGyroSensorAvailable = deviceMotion.rotationRate.alpha !== null;

					res(isGyroSensorAvailable);
				};

				window.addEventListener("devicemotion", onDeviceMotionChange);
			});
		}

		function timeout() {
			return new Promise((res, rej) => {
				setTimeout(() => res(false), 1000);
			});
		}

		Promise.race([checkGyro(), timeout()]).then(isGyroSensorAvailable => {
			window.removeEventListener("devicemotion", onDeviceMotionChange);

			callback && callback(isGyroSensorAvailable);

			PanoViewer.isGyroSensorAvailable = function(fb) {
				fb && fb(isGyroSensorAvailable);
				return isGyroSensorAvailable;
			};
		});
	}
}

PanoViewer.ERROR_TYPE = ERROR_TYPE;
PanoViewer.EVENTS = EVENTS;
PanoViewer.ProjectionType = PROJECTION_TYPE;
