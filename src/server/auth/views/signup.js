/*
 * Copyright (c) 2012-2015 S-Core Co., Ltd.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function doSignup() {
    var password = document.getElementById("signupPassword").value;
    var password2 = document.getElementById("signupPassword2").value;
    var submitURL = document.getElementById("submitURL").value;
    var email = document.getElementById("email").value;
    var activationKey = document.getElementById("activationKey").value;

    if (!password || !password2) {
        alert('Password must be filled.');
        return false;
    }

    if (password !== password2) {
        alert('Passwords are not matched.');
        return false;
    }

    if (password.length < 6) {
        alert('Password length must be longer than 5 characters.');
        return false;
    }

    var formData = new FormData();
    formData.append('email', email);
    formData.append('activationKey', activationKey);
    formData.append('password', window.btoa(password));

    $.ajax({
        url: submitURL,
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function (data) {
            data = JSON.parse(data);
            if (data.result === 'ok') {
                if (opener) {
                    window.opener.postMessage(data.data, location.origin);
                }
                location.href = data.data;
            } else {
                alert(data.reason);
            }
        },
        error: function (jqXHR) {
            console.log('failed', jqXHR);
            alert(jqXHR.responseText);
        }
    });
}

document.onkeydown = function (event) {
    var keyCode = event.keyCode ? event.keyCode : event.which;
    if (keyCode == 13) {
        document.getElementById('signupSubmit').click();
    }
}
