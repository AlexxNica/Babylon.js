﻿module BABYLON {

    export interface IShadowLight {
        id: string;
        position: Vector3;
        transformedPosition: Vector3;
        name: string;
        shadowMinZ: number;
        shadowMaxZ: number;

        computeTransformedPosition(): boolean;
        getScene(): Scene;

        customProjectionMatrixBuilder: (viewMatrix: Matrix, renderList: Array<AbstractMesh>, result: Matrix) => void;
        setShadowProjectionMatrix(matrix: Matrix, viewMatrix: Matrix, renderList: Array<AbstractMesh>): void;
        getDepthScale(): number;

        needRefreshPerFrame(): boolean;
        needCube(): boolean;

        getShadowDirection(faceIndex?: number): Vector3;

        _shadowGenerator: IShadowGenerator;
    }

    export class Light extends Node {

        //lightmapMode Consts
        private static _LIGHTMAP_DEFAULT = 0;
        private static _LIGHTMAP_SPECULAR = 1;
        private static _LIGHTMAP_SHADOWSONLY = 2;

        /**
         * If every light affecting the material is in this lightmapMode,
         * material.lightmapTexture adds or multiplies
         * (depends on material.useLightmapAsShadowmap)
         * after every other light calculations.
         */
        public static get LIGHTMAP_DEFAULT(): number {
            return Light._LIGHTMAP_DEFAULT;
        }

        /**
         * material.lightmapTexture as only diffuse lighting from this light
         * adds pnly specular lighting from this light
         * adds dynamic shadows
         */
        public static get LIGHTMAP_SPECULAR(): number {
            return Light._LIGHTMAP_SPECULAR;
        }

        /**
         * material.lightmapTexture as only lighting
         * no light calculation from this light
         * only adds dynamic shadows from this light
         */
        public static get LIGHTMAP_SHADOWSONLY(): number {
            return Light._LIGHTMAP_SHADOWSONLY;
        }

        @serializeAsColor3()
        public diffuse = new Color3(1.0, 1.0, 1.0);

        @serializeAsColor3()
        public specular = new Color3(1.0, 1.0, 1.0);

        @serialize()
        public intensity = 1.0;

        @serialize()
        public range = Number.MAX_VALUE;

        @serialize()
        public includeOnlyWithLayerMask = 0;

        public includedOnlyMeshes = new Array<AbstractMesh>();
        public excludedMeshes = new Array<AbstractMesh>();

        @serialize()
        public excludeWithLayerMask = 0;

        @serialize()
        public lightmapMode = 0;

        // PBR Properties.
        @serialize()
        public radius = 0.00001;

        public _shadowGenerator: IShadowGenerator;
        private _parentedWorldMatrix: Matrix;
        public _excludedMeshesIds = new Array<string>();
        public _includedOnlyMeshesIds = new Array<string>();

        // Light uniform buffer
        public _uniformBuffer: UniformBuffer;

        /**
         * Creates a Light object in the scene.  
         * Documentation : http://doc.babylonjs.com/tutorials/lights  
         */
        constructor(name: string, scene: Scene) {
            super(name, scene);
            this.getScene().addLight(this);
            this._uniformBuffer = new UniformBuffer(scene.getEngine(), null, true);
            this._buildUniformLayout();
        }

        protected _buildUniformLayout(): void {
            // Overridden
        }

        /**
         * Returns the string "Light".  
         */
        public getClassName(): string {
            return "Light";
        }        

        /**
         * @param {boolean} fullDetails - support for multiple levels of logging within scene loading
         */
        public toString(fullDetails? : boolean) : string {
            var ret = "Name: " + this.name;
            ret += ", type: " + (["Point", "Directional", "Spot", "Hemispheric"])[this.getTypeID()];
            if (this.animations){
                for (var i = 0; i < this.animations.length; i++){
                   ret += ", animation[0]: " + this.animations[i].toString(fullDetails);
                }
            }
            if (fullDetails){
            }
            return ret;
        } 
        /**
         * Returns the Light associated shadow generator.  
         */
        public getShadowGenerator(): IShadowGenerator {
            return this._shadowGenerator;
        }

        /**
         * Returns a Vector3, the absolute light position in the World.  
         */
        public getAbsolutePosition(): Vector3 {
            return Vector3.Zero();
        }

        public transferToEffect(effect: Effect, uniformName0?: string, uniformName1?: string): void {
        }

        public _getWorldMatrix(): Matrix {
            return Matrix.Identity();
        }

        /**
         * Boolean : True if the light will affect the passed mesh.  
         */
        public canAffectMesh(mesh: AbstractMesh): boolean {
            if (!mesh) {
                return true;
            }

            if (this.includedOnlyMeshes.length > 0 && this.includedOnlyMeshes.indexOf(mesh) === -1) {
                return false;
            }

            if (this.excludedMeshes.length > 0 && this.excludedMeshes.indexOf(mesh) !== -1) {
                return false;
            }

            if (this.includeOnlyWithLayerMask !== 0 && (this.includeOnlyWithLayerMask & mesh.layerMask) === 0) {
                return false;
            }

            if (this.excludeWithLayerMask !== 0 && this.excludeWithLayerMask & mesh.layerMask) {
                return false;
            }

            return true;
        }

        /**
         * Returns the light World matrix.  
         */
        public getWorldMatrix(): Matrix {
            this._currentRenderId = this.getScene().getRenderId();

            var worldMatrix = this._getWorldMatrix();

            if (this.parent && this.parent.getWorldMatrix) {
                if (!this._parentedWorldMatrix) {
                    this._parentedWorldMatrix = Matrix.Identity();
                }

                worldMatrix.multiplyToRef(this.parent.getWorldMatrix(), this._parentedWorldMatrix);

                this._markSyncedWithParent();

                return this._parentedWorldMatrix;
            }

            return worldMatrix;
        }

        /**
         * Disposes the light.  
         */
        public dispose(): void {
            if (this._shadowGenerator) {
                this._shadowGenerator.dispose();
                this._shadowGenerator = null;
            }

            // Animations
            this.getScene().stopAnimation(this);
            // Remove from scene
            this.getScene().removeLight(this);
            super.dispose();
        }

        /**
         * Returns the light type ID (integer).  
         */
        public getTypeID(): number {
            return 0;
        }

        /**
         * Returns a new Light object, named "name", from the current one.  
         */
        public clone(name: string): Light {
            return SerializationHelper.Clone(Light.GetConstructorFromName(this.getTypeID(), name, this.getScene()), this);
        }
        /**
         * Serializes the current light into a Serialization object.  
         * Returns the serialized object.  
         */
        public serialize(): any {
            var serializationObject = SerializationHelper.Serialize(this);

            // Type
            serializationObject.type = this.getTypeID();

            // Parent
            if (this.parent) {
                serializationObject.parentId = this.parent.id;
            }

            // Inclusion / exclusions
            if (this.excludedMeshes.length > 0) {
                serializationObject.excludedMeshesIds = [];
                this.excludedMeshes.forEach((mesh: AbstractMesh) => {
                    serializationObject.excludedMeshesIds.push(mesh.id);
                });
            }

            if (this.includedOnlyMeshes.length > 0) {
                serializationObject.includedOnlyMeshesIds = [];
                this.includedOnlyMeshes.forEach((mesh: AbstractMesh) => {
                    serializationObject.includedOnlyMeshesIds.push(mesh.id);
                });
            }

            // Animations  
            Animation.AppendSerializedAnimations(this, serializationObject);
            serializationObject.ranges = this.serializeAnimationRanges();  

            return serializationObject;
        }

        /**
         * Creates a new typed light from the passed type (integer) : point light = 0, directional light = 1, spot light = 2, hemispheric light = 3.  
         * This new light is named "name" and added to the passed scene.  
         */
        static GetConstructorFromName(type: number, name: string, scene: Scene): () => Light {
            switch (type) {
                case 0:
                    return () => new PointLight(name, Vector3.Zero(), scene);
                case 1:
                    return () => new DirectionalLight(name, Vector3.Zero(), scene);
                case 2:
                    return () => new SpotLight(name, Vector3.Zero(), Vector3.Zero(), 0, 0, scene);
                case 3:
                    return () => new HemisphericLight(name, Vector3.Zero(), scene);
            }
        }

        /**
         * Parses the passed "parsedLight" and returns a new instanced Light from this parsing.  
         */
        public static Parse(parsedLight: any, scene: Scene): Light {            
            var light = SerializationHelper.Parse(Light.GetConstructorFromName(parsedLight.type, parsedLight.name, scene), parsedLight, scene);

            // Inclusion / exclusions
            if (parsedLight.excludedMeshesIds) {
                light._excludedMeshesIds = parsedLight.excludedMeshesIds;
            }

            if (parsedLight.includedOnlyMeshesIds) {
                light._includedOnlyMeshesIds = parsedLight.includedOnlyMeshesIds;
            }

            // Parent
            if (parsedLight.parentId) {
                light._waitingParentId = parsedLight.parentId;
            }

            // Animations
            if (parsedLight.animations) {
                for (var animationIndex = 0; animationIndex < parsedLight.animations.length; animationIndex++) {
                    var parsedAnimation = parsedLight.animations[animationIndex];

                    light.animations.push(Animation.Parse(parsedAnimation));
                }
                Node.ParseAnimationRanges(light, parsedLight, scene);
            }

            if (parsedLight.autoAnimate) {
                scene.beginAnimation(light, parsedLight.autoAnimateFrom, parsedLight.autoAnimateTo, parsedLight.autoAnimateLoop, parsedLight.autoAnimateSpeed || 1.0);
            }

            return light;
        }
    }
}
