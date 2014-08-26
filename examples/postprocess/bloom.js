'use strict';

window.OSG.globalify();

var osg = window.osg;
var osgUtil = window.osgUtil;

/*
    This filter simulate a property of lenses which tends to make
    highly lit areas bleed along its normal borders
*/
function getPostSceneBloom( sceneTexture, bloomTextureFactor ) {

    var threshold = osg.Uniform.createFloat1( 0.8, 'threshold' );
    var factor = osg.Uniform.createFloat1( 0.6, 'factor' );

    if ( bloomTextureFactor === undefined )
        bloomTextureFactor = 8;

    var currentSceneTexture = osg.Texture.createFromURL( 'Budapest.jpg' );
    var cachedScenes = [];

    var setSceneTexture = function ( sceneFile ) {

        // On met en cache lors du premier chargement
        if ( cachedScenes[ sceneFile ] === undefined )
            cachedScenes[ sceneFile ] = osg.Texture.createFromURL( sceneFile );

        currentSceneTexture = cachedScenes[ sceneFile ];
        additiveFilter.getStateSet().setTextureAttributeAndMode( 0, currentSceneTexture );
        brightFilter.getStateSet().setTextureAttributeAndMode( 0, currentSceneTexture );
    };

    // create a downsized texture to render the bloom to
    var bloomTexture = new osg.Texture();
    bloomTexture.setTextureSize( sceneTexture.getWidth() / bloomTextureFactor, sceneTexture.getHeight() / bloomTextureFactor );
    bloomTexture.setMinFilter( 'LINEAR' );
    bloomTexture.setMagFilter( 'LINEAR' );

    var brightFilter = new osgUtil.Composer.Filter.Custom(
        [
            '#ifdef GL_ES',
            'precision highp float;',
            '#endif',

            '#define USE_LINEAR_SPACE 1',

            'varying vec2 FragTexCoord0;',
            'uniform sampler2D Texture0;',
            'uniform float threshold;',

            // Definition of luminance from http://en.wikipedia.org/wiki/Luma_%28video%29
            'float calcLuminance(vec3 pixel) {',
            '   return dot(pixel, vec3(0.2126, 0.7152, 0.0722));',
            '}',
            'void main(void) {',

            '    vec4 color = texture2D( Texture0, FragTexCoord0);',
               
            '    #ifdef USE_LINEAR_SPACE',
            '       color = pow(color, vec4(2.2));',
            '   #endif',
               
            '   vec3 result = vec3(0);',

            // Keep only the pixels whose luminance is above threshold
            '   if (calcLuminance(color.rgb) > threshold)',
            '      result = color.rgb;',

            '   gl_FragColor = vec4(result, 1.0);',

            '}',
        ].join( '\n' ), {
            'Texture0': currentSceneTexture,
            'threshold': threshold,
        }
    );

    var additiveFilter = new osgUtil.Composer.Filter.Custom(
        [
            '#ifdef GL_ES',
            'precision highp float;',
            '#endif',
            'varying vec2 FragTexCoord0;',
            'uniform sampler2D Texture0;',
            'uniform sampler2D Texture1;',
            'uniform float factor;',


            'void main(void) {',
            '  vec4 color_a = texture2D( Texture0, FragTexCoord0);',
            '  vec4 color_b = texture2D( Texture1, FragTexCoord0);',

            '  gl_FragColor = color_a + (color_b * factor);',
            '}',
        ].join( '\n' ), {
            'Texture0': currentSceneTexture,
            'Texture1': bloomTexture,
            'factor': factor,
        }
    );

    /* General idea for the bloom's algorithm:
        - Apply a brightpass to the scene texture to keep only the bright areas
        - Downsample the bright texture
        - Blur the bright texture to have a "glow" effect
        - Apply the blurred texture on the original scene texture
        (the downsampling helps to reduce the cost of the blur) 
    */
    var effect = {

        name: 'Bloom',
        needCommonCube: false,

        buildComposer: function ( finalTexture ) {

            var composer = new osgUtil.Composer();

            // Keep only the bright pixels and downsize the scene texture
            composer.addPass( brightFilter, bloomTexture );

            // Blur the bright downsized sceneTexture
            composer.addPass( new osgUtil.Composer.Filter.AverageVBlur( 10 ) );
            composer.addPass( new osgUtil.Composer.Filter.AverageHBlur( 10 ) );
            composer.addPass( new osgUtil.Composer.Filter.AverageVBlur( 10 ) );
            composer.addPass( new osgUtil.Composer.Filter.AverageHBlur( 10 ), bloomTexture );

            // Add the original scene texture and the bloom texture and render into final texture
            composer.addPass( additiveFilter, finalTexture );

            composer.build();

            return composer;
        },

        buildGui: function ( mainGui ) {

            var folder = mainGui.addFolder( 'Bloom' );
            folder.open();

            var bloom = {
                scene: [ 'Budapest.jpg', 'Beaumaris.jpg', 'Seattle.jpg' ],
                threshold: threshold.get()[ 0 ],
                factor: factor.get()[ 0 ],
            };

            var sceneCtrl = folder.add( bloom, 'scene', bloom.scene );
            var thresholdCtrl = folder.add( bloom, 'threshold', 0.0, 1.0 );
            var factorCtrl = folder.add( bloom, 'factor', 0.0, 1.0 );

            thresholdCtrl.onChange( function ( value ) {
                threshold.set( value );
            } );

            factorCtrl.onChange( function ( value ) {
                factor.set( value );
            } );

            sceneCtrl.onChange( function ( value ) {
                setSceneTexture( value );
            } );
        }
    };

    return effect;

}
